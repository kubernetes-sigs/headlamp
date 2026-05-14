#!/usr/bin/env bash
# Boot the OIDC reproduction stack: kind + Dex + two headlamp-server replicas
# behind an nginx round-robin.
#
# Run from the repo root or from tools/oidc-repro.
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
REPRO_DIR="$( dirname "$SCRIPT_DIR" )"
REPO_ROOT="$( cd "$REPRO_DIR/../.." && pwd )"

CLUSTER_NAME=headlamp-oidc-repro
IMAGE=headlamp:repro

echo "==> [1/5] Building headlamp-server image (this builds frontend + backend)"
( cd "$REPO_ROOT" && docker build -t "$IMAGE" . )

echo "==> [2/5] Creating kind cluster ($CLUSTER_NAME)"
if kind get clusters | grep -qx "$CLUSTER_NAME"; then
  echo "    cluster exists, reusing"
else
  kind create cluster --name "$CLUSTER_NAME" --config "$REPRO_DIR/kind-config.yaml"
fi

echo "==> [3/5] Loading image into kind"
kind load docker-image --name "$CLUSTER_NAME" "$IMAGE"

echo "==> [4/5] Deploying Dex"
kubectl apply -f "$REPRO_DIR/dex/dex-config.yaml"
kubectl apply -f "$REPRO_DIR/dex/dex-deploy.yaml"
kubectl -n dex wait --for=condition=Available deploy/dex --timeout=120s

echo "==> [5/5] Deploying two headlamp-server replicas + nginx round-robin"
kubectl apply -f "$REPRO_DIR/headlamp/two-replicas.yaml"

# Replace the placeholder ConfigMap with the real nginx config from the repo.
kubectl -n headlamp create configmap nginx-rr \
  --from-file=nginx.conf="$REPRO_DIR/headlamp/nginx-rr.conf" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n headlamp rollout restart deploy/nginx-rr

kubectl -n headlamp wait --for=condition=Available deploy/hl-a --timeout=120s
kubectl -n headlamp wait --for=condition=Available deploy/hl-b --timeout=120s
kubectl -n headlamp wait --for=condition=Available deploy/nginx-rr --timeout=60s

NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
HEADLAMP_URL="http://${NODE_IP}:30080"

cat <<EOF

================================================================
Stack is up.

  Dex issuer (cluster-internal): http://dex.dex.svc.cluster.local:5556/dex
  Dex (port-forward for browser login):
      kubectl -n dex port-forward svc/dex 5556:5556

  Headlamp (round-robin nginx in front of hl-a + hl-b):
      $HEADLAMP_URL

  Direct replicas (for diagnostics):
      kubectl -n headlamp port-forward svc/hl-a 4466:4466
      kubectl -n headlamp port-forward svc/hl-b 4467:4466

  Test users (Dex):
      alice@example.com / password
      bob@example.com   / password

Next: run the per-issue repro scripts.
  ./scripts/repro-4019.sh
  ./scripts/repro-4877.sh
  ./scripts/repro-4721.sh
  ./scripts/repro-2126.sh

Tear down: ./scripts/down.sh
================================================================
EOF
