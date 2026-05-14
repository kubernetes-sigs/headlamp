#!/usr/bin/env bash
# Reproduce #4721 — testAuth false positive on selfsubjectrulesreviews.
#
# Hypothesis: on cluster shapes where system:basic-user ClusterRoleBinding
# grants selfsubjectrulesreviews to system:unauthenticated, an anonymous POST
# returns 201 with empty rules, which the frontend treats as "logged in".
#
# Verification: hit SSRR as both an authenticated user and as anonymous, and
# compare the response shapes.
set -euo pipefail

mkdir -p tools/oidc-repro/notes
NOTES=tools/oidc-repro/notes/4721.md

CTX="kind-headlamp-oidc-repro"

echo "==> Checking whether system:unauthenticated has SSRR access by default"
kubectl --context "$CTX" auth can-i create selfsubjectrulesreviews \
  --as=system:anonymous || true

echo
echo "==> Patching system:basic-user CRB to include system:unauthenticated"
echo "    (matches the cluster shape agapoff describes)"
cat <<'EOF' | kubectl --context "$CTX" apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: repro-anonymous-basic-user
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:basic-user
subjects:
  - kind: Group
    name: system:unauthenticated
    apiGroup: rbac.authorization.k8s.io
EOF

echo
echo "==> Anonymous SSRR (the failure case)"
APISERVER=$(kubectl --context "$CTX" config view --minify -o jsonpath='{.clusters[0].cluster.server}')

cat <<EOF
Manual step: from inside the cluster (or via a port-forward), POST to:
    \$APISERVER/apis/authorization.k8s.io/v1/selfsubjectrulesreviews
WITHOUT an Authorization header. The response body shape is what the
frontend currently treats as "logged in".

Easiest path: open the apiserver insecure port via a kubectl proxy:
    kubectl --context $CTX proxy --port=8001 &
    curl -sS -X POST -H 'Content-Type: application/json' \\
      http://127.0.0.1:8001/apis/authorization.k8s.io/v1/selfsubjectrulesreviews \\
      -d '{"kind":"SelfSubjectRulesReview","apiVersion":"authorization.k8s.io/v1","spec":{"namespace":"default"}}'

Note: kubectl proxy authenticates ON YOUR BEHALF, so it will NOT show the
anonymous response. To get a real anonymous response, hit the apiserver
directly with no creds and --insecure-skip-tls-verify, OR run the curl from
inside a pod with no SA token.

Alternative: deploy the test pod below and exec into it.
EOF

cat <<'EOF' | kubectl --context "$CTX" apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: ssrr-anonymous-probe
  namespace: default
spec:
  automountServiceAccountToken: false
  containers:
    - name: c
      image: curlimages/curl:8.7.1
      command: ["sleep", "3600"]
EOF

kubectl --context "$CTX" wait --for=condition=Ready pod/ssrr-anonymous-probe --timeout=60s

echo
echo "==> SSRR from inside a pod with NO service account token mounted"
kubectl --context "$CTX" exec ssrr-anonymous-probe -- sh -c '
  APISERVER="https://kubernetes.default.svc"
  curl -k -sS -X POST \
    -H "Content-Type: application/json" \
    "$APISERVER/apis/authorization.k8s.io/v1/selfsubjectrulesreviews" \
    -d "{\"kind\":\"SelfSubjectRulesReview\",\"apiVersion\":\"authorization.k8s.io/v1\",\"spec\":{\"namespace\":\"default\"}}"
'

echo
echo
echo "==> Authenticated SSRR (the should-be-fine case)"
SA_TOKEN=$(kubectl --context "$CTX" -n headlamp create token headlamp --duration 1h)
kubectl --context "$CTX" exec ssrr-anonymous-probe -- sh -c "
  APISERVER=\"https://kubernetes.default.svc\"
  curl -k -sS -X POST \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer $SA_TOKEN' \
    \"\$APISERVER/apis/authorization.k8s.io/v1/selfsubjectrulesreviews\" \
    -d '{\"kind\":\"SelfSubjectRulesReview\",\"apiVersion\":\"authorization.k8s.io/v1\",\"spec\":{\"namespace\":\"default\"}}'
"

cat <<EOF >> "$NOTES"
# 4721 repro run on $(date -Iseconds)

## Anonymous SSRR
- HTTP status:
- status.resourceRules length:
- status.nonResourceRules length:
- status.incomplete:

## Authenticated SSRR (headlamp SA)
- HTTP status:
- status.resourceRules length:
- status.nonResourceRules length:

## Verdict for testAuth fix
- Is there a usable response-shape signal that distinguishes the two? (yes/no)
- Or is /me cookie verification the cleaner gate?
EOF

echo
echo "==> Cleaning up the anonymous-grant CRB and probe pod"
kubectl --context "$CTX" delete clusterrolebinding repro-anonymous-basic-user
kubectl --context "$CTX" delete pod ssrr-anonymous-probe

echo
echo "Compare the two response bodies above and fill in $NOTES."
