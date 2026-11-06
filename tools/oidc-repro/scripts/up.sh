#!/usr/bin/env bash

# Copyright 2025 The Kubernetes Authors.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Boot the OIDC reproduction stack: kind + Dex + two headlamp-server replicas
# behind an nginx round-robin.
#
# Safe to run from anywhere; all paths resolve from this script's location and
# all kubectl calls go through the harness-local kubeconfig.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"

echo "==> [1/6] Building headlamp-server image (this builds frontend + backend)"
if [ "${REPRO_SKIP_BUILD:-}" = "1" ]; then
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "error: REPRO_SKIP_BUILD=1 but image '$IMAGE' does not exist." >&2
    exit 1
  fi
  echo "    REPRO_SKIP_BUILD=1, reusing existing $IMAGE"
else
  # Pass build metadata explicitly so linked worktrees need no .git directory.
  ( cd "$REPO_ROOT" && docker build --build-arg HEADLAMP_SOURCE_COMMIT="$(git rev-parse HEAD)" -t "$IMAGE" . )
fi

echo "==> [2/6] Creating kind cluster ($CLUSTER_NAME)"
if kind get clusters | grep -qx "$CLUSTER_NAME"; then
  echo "    cluster exists, reusing"
  # Refresh the harness kubeconfig in case it was removed. This writes only to
  # $KUBECONFIG, never to ~/.kube/config.
  kind export kubeconfig --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG"
else
  kind create cluster --name "$CLUSTER_NAME" \
    --config "$REPRO_DIR/kind-config.yaml" \
    --kubeconfig "$KUBECONFIG"
fi

echo "==> [3/6] Loading image into kind"
kind load docker-image --name "$CLUSTER_NAME" "$IMAGE"

# Every URL below is built from the node's InternalIP so that one issuer URL is
# byte-identical from the browser and from inside the headlamp pods. go-oidc
# validates the `iss` claim against the configured issuer, so these must match.
NODE_IP="$(node_ip)"
DEX_ISSUER="http://${NODE_IP}:${DEX_NODEPORT}/dex"
HEADLAMP_URL="http://${NODE_IP}:${HEADLAMP_NODEPORT}"
CALLBACK_URL="${HEADLAMP_URL}/oidc-callback"

echo "==> [4/6] Deploying Dex (issuer $DEX_ISSUER)"
kubectl --context "$CTX" apply -f "$REPRO_DIR/dex/dex-deploy.yaml"

# The Dex config carries the issuer and the exact redirect URI, both of which
# depend on a node IP that does not exist until the cluster is created.
# Template them in here rather than shipping a config that can only be wrong.
sed -e "s|__DEX_ISSUER__|${DEX_ISSUER}|g" \
    -e "s|__CALLBACK_URL__|${CALLBACK_URL}|g" \
    "$REPRO_DIR/dex/dex-config.yaml" \
  | kubectl --context "$CTX" apply -f -

kubectl --context "$CTX" -n dex rollout restart deploy/dex
kubectl --context "$CTX" -n dex rollout status deploy/dex --timeout=120s

echo "==> [5/6] Deploying two headlamp-server replicas + nginx round-robin"
kubectl --context "$CTX" apply -f "$REPRO_DIR/headlamp/two-replicas.yaml"

# Real OIDC settings, derived above. Replaces the placeholder ConfigMap.
kubectl --context "$CTX" -n headlamp create configmap headlamp-oidc \
  --from-env-file=<( \
    printf 'OIDC_ISSUER_URL=%s\nOIDC_CLIENT_ID=headlamp-test\nOIDC_SCOPES=openid,email,profile,groups,offline_access\nOIDC_CALLBACK_URL=%s\n' "$DEX_ISSUER" "$CALLBACK_URL"
    awk '/^[[:space:]]+secret:/ { print "OIDC_CLIENT_SECRET=" $2 }' "$REPRO_DIR/dex/dex-config.yaml"
  ) \
  --dry-run=client -o yaml | kubectl --context "$CTX" apply -f -

# Replace the placeholder nginx ConfigMap with the real config from the repo.
kubectl --context "$CTX" -n headlamp create configmap nginx-rr \
  --from-file=nginx.conf="$REPRO_DIR/headlamp/nginx-rr.conf" \
  --dry-run=client -o yaml | kubectl --context "$CTX" apply -f -

echo "==> [6/6] Rolling out"
# ConfigMap contents are not part of the pod spec, so they do not trigger a
# rollout on their own.
kubectl --context "$CTX" -n headlamp rollout restart deploy/hl-a deploy/hl-b deploy/nginx-rr

# rollout status, NOT `wait --for=condition=Available`: Available stays true
# throughout a rolling update, so the wait would return immediately against the
# old ReplicaSet and we would report success while nginx still served the
# placeholder config.
kubectl --context "$CTX" -n headlamp rollout status deploy/hl-a --timeout=180s
kubectl --context "$CTX" -n headlamp rollout status deploy/hl-b --timeout=180s
kubectl --context "$CTX" -n headlamp rollout status deploy/nginx-rr --timeout=120s

# Even after `rollout status` returns, the NodePort is not necessarily serving:
# kube-proxy has to observe the new pod IPs and rewrite its rules, and the
# terminating pods from the previous ReplicaSet are still draining. Running a
# repro script immediately after up.sh in that window fails with a bare
# `curl: (7) Failed to connect` that looks like a harness bug rather than a
# race. Poll the two URLs the repro scripts actually use before claiming
# success, so "up.sh exited 0" means "reachable".
#
# The status code has to be checked explicitly. A bare `curl` exits 0 for any
# completed HTTP transaction, so it treats nginx answering 502 because its
# upstreams have not come back yet -- the exact middle of the race -- as
# success. Accept only 2xx/3xx; 000 means the connection itself failed.
wait_for_url() {
  local url="$1" name="$2" code="" deadline=$((SECONDS + 120))
  while [ "$SECONDS" -lt "$deadline" ]; do
    # curl itself prints 000 when the connection never completes, so this only
    # needs to survive the nonzero exit, not substitute a value.
    code="$(curl -q -sS -o /dev/null --max-time 5 -w '%{http_code}' "$url" 2>/dev/null || true)"
    case "${code:-000}" in
      2?? | 3??) return 0 ;;
    esac
    sleep 2
  done
  echo "error: $name did not become reachable at $url within 120s." >&2
  echo "       Last HTTP status: ${code:-none} (000 = could not connect)." >&2
  echo "       Check: kubectl --context $CTX -n headlamp get pods" >&2
  return 1
}

echo "==> Waiting for the NodePorts to serve"
wait_for_url "$HEADLAMP_URL/" "headlamp (via nginx)"
wait_for_url "$DEX_ISSUER/.well-known/openid-configuration" "dex"

cat <<EOF

================================================================
Stack is up.

  Headlamp (nginx round-robin over hl-a + hl-b):
      $HEADLAMP_URL

  Dex issuer (same URL from the browser and from the pods):
      $DEX_ISSUER

  Test-only users and client credentials:
      See $REPRO_DIR/dex/dex-config.yaml (committed public fixture).
      Do not copy issued tokens, codes, cookies or OAuth URLs into notes.

  Direct replicas (for diagnostics):
      kubectl --kubeconfig $KUBECONFIG -n headlamp port-forward svc/hl-a 4466:4466
      kubectl --kubeconfig $KUBECONFIG -n headlamp port-forward svc/hl-b 4467:4466

  This harness uses its own kubeconfig and never touches ~/.kube/config:
      export KUBECONFIG=$KUBECONFIG

Check callback completion separately from Kubernetes authentication.
The API server deliberately rejects Dex tokens; a usable UI login is not
expected. Do not enable a ServiceAccount fallback or add OIDC trust here.
Browser recipes also depend on which replica handles the callback.

Repro scripts:
  ./scripts/repro-4019.sh
  ./scripts/repro-4877.sh
  ./scripts/repro-4721.sh
  ./scripts/repro-2126.sh

Tear down: ./scripts/down.sh
================================================================
EOF
