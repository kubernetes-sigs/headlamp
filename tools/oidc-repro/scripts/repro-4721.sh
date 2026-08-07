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

# Reproduce https://github.com/kubernetes-sigs/headlamp/issues/4721
# — Headlamp's auth probe reports success for an unauthenticated user.
#
# Hypothesis: on clusters where the system:basic-user ClusterRole is bound to
# system:unauthenticated, an anonymous POST to selfsubjectrulesreviews returns
# 201 with an empty rule set instead of 401. Headlamp treats any 2xx as "signed
# in", so the user reaches the UI without credentials.
#
# What this observes: the SSRR status and body for three callers on the same
# cluster — anonymous, a namespace-scoped ServiceAccount, and (for contrast)
# the cluster-admin ServiceAccount Headlamp itself runs as. The question the
# fix depends on is whether the anonymous response is distinguishable from a
# genuinely-authenticated-but-unprivileged one by shape alone.
#
# This script grants system:basic-user to system:unauthenticated to create the
# reported cluster shape. That grant and the probe pod are removed on exit,
# including on failure — see the trap below.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"
require_cluster

NOTES="$(notes_file 4721.md)"

ANON_CRB=repro-anonymous-basic-user
PROBE_POD=ssrr-anonymous-probe
LIMITED_SA=repro-limited

# Everything this script creates is torn down here. Without the trap, any
# failure between the grant and the cleanup would strand a cluster-wide
# anonymous-access binding on the cluster.
cleanup() {
  echo
  echo "==> Cleaning up (grant, probe pod, scoped SA)"
  kubectl --context "$CTX" delete clusterrolebinding "$ANON_CRB" --ignore-not-found >/dev/null 2>&1 || true
  kubectl --context "$CTX" -n default delete pod "$PROBE_POD" --ignore-not-found --now >/dev/null 2>&1 || true
  kubectl --context "$CTX" -n default delete rolebinding "$LIMITED_SA" --ignore-not-found >/dev/null 2>&1 || true
  kubectl --context "$CTX" -n default delete serviceaccount "$LIMITED_SA" --ignore-not-found >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Baseline: can system:anonymous create selfsubjectrulesreviews?"
kubectl --context "$CTX" auth can-i create selfsubjectrulesreviews --as=system:anonymous || true

echo
echo "==> Granting system:basic-user to system:unauthenticated"
echo "    (this is the cluster shape the issue reports; removed on exit)"
kubectl --context "$CTX" apply -f - <<EOF
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: $ANON_CRB
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:basic-user
subjects:
  - kind: Group
    name: system:unauthenticated
    apiGroup: rbac.authorization.k8s.io
EOF

# A ServiceAccount with a small, namespace-scoped grant. This is the
# interesting comparison: the headlamp SA is bound to cluster-admin, so
# comparing anonymous against it is anonymous-vs-omnipotent and tells us little
# about whether response shape can distinguish authenticated from not.
echo
echo "==> Creating a namespace-scoped ServiceAccount for comparison"
kubectl --context "$CTX" apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: $LIMITED_SA
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: $LIMITED_SA
  namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
subjects:
  - kind: ServiceAccount
    name: $LIMITED_SA
    namespace: default
EOF

echo
echo "==> Starting probe pod (no service account token mounted)"
kubectl --context "$CTX" apply -f - <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $PROBE_POD
  namespace: default
spec:
  automountServiceAccountToken: false
  restartPolicy: Never
  containers:
    - name: c
      image: curlimages/curl:8.7.1
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false
        runAsNonRoot: true
        # curlimages/curl declares USER as the name "curl_user", and the
        # kubelet cannot verify a non-numeric user is non-root -- the pod fails
        # with CreateContainerConfigError. Pin the numeric uid instead.
        runAsUser: 100
        capabilities:
          drop: ["ALL"]
EOF

kubectl --context "$CTX" -n default wait --for=condition=Ready "pod/$PROBE_POD" --timeout=120s

# Run SSRR from inside the probe pod. When there is a token it is piped in on
# stdin and read into a shell variable rather than interpolated into the
# command line — an argv-visible bearer token is a bad habit to model even on a
# throwaway cluster. The remote script is passed via `sh -c` so that stdin
# stays free for the token.
ssrr_anon() {
  kubectl --context "$CTX" -n default exec "$PROBE_POD" -- sh -c '
    curl -k -sS -o /tmp/out -w "%{http_code}\n" -X POST \
      -H "Content-Type: application/json" \
      "https://kubernetes.default.svc/apis/authorization.k8s.io/v1/selfsubjectrulesreviews" \
      -d "{\"kind\":\"SelfSubjectRulesReview\",\"apiVersion\":\"authorization.k8s.io/v1\",\"spec\":{\"namespace\":\"default\"}}"
    cat /tmp/out
  '
}

ssrr_token() {
  # Trailing newline matters: the remote `read` needs a line terminator.
  printf '%s\n' "$1" | kubectl --context "$CTX" -n default exec -i "$PROBE_POD" -- sh -c '
    read -r TOKEN
    curl -k -sS -o /tmp/out -w "%{http_code}\n" -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      "https://kubernetes.default.svc/apis/authorization.k8s.io/v1/selfsubjectrulesreviews" \
      -d "{\"kind\":\"SelfSubjectRulesReview\",\"apiVersion\":\"authorization.k8s.io/v1\",\"spec\":{\"namespace\":\"default\"}}"
    cat /tmp/out
  '
}

echo
echo "=============================================================="
echo "ANONYMOUS (no Authorization header) — the failure case"
echo "=============================================================="
ANON_OUT="$(ssrr_anon || true)"
echo "$ANON_OUT"

echo
echo "=============================================================="
echo "NAMESPACE-SCOPED SA ($LIMITED_SA, ClusterRole/view in default)"
echo "=============================================================="
LIMITED_TOKEN="$(kubectl --context "$CTX" -n default create token "$LIMITED_SA" --duration 1h)"
LIMITED_OUT="$(ssrr_token "$LIMITED_TOKEN" || true)"
echo "$LIMITED_OUT"

echo
echo "=============================================================="
echo "CLUSTER-ADMIN SA (headlamp) — upper bound, for contrast"
echo "=============================================================="
ADMIN_TOKEN="$(kubectl --context "$CTX" -n headlamp create token headlamp --duration 1h)"
ADMIN_OUT="$(ssrr_token "$ADMIN_TOKEN" || true)"
echo "$ADMIN_OUT"

{
  echo "# 4721 repro run on $(date -Iseconds)"
  echo
  echo "First line of each block is the HTTP status; the rest is the body."
  echo
  echo '## Anonymous'
  echo '```'
  echo "$ANON_OUT"
  echo '```'
  echo
  echo "## Namespace-scoped SA ($LIMITED_SA)"
  echo '```'
  echo "$LIMITED_OUT"
  echo '```'
  echo
  echo '## Cluster-admin SA (headlamp)'
  echo '```'
  echo "$ADMIN_OUT"
  echo '```'
  echo
  echo '## Verdict'
  echo
  echo '- Does anonymous return 2xx rather than 401?'
  echo '- Can the anonymous body be told apart from the namespace-scoped one by'
  echo '  shape alone (rule counts, `incomplete`), or only by who the caller is?'
  echo '- If not distinguishable, the auth probe needs a different signal.'
  echo
} >> "$NOTES"

echo
echo "Appended to $NOTES — compare the three bodies and fill in the verdict."
