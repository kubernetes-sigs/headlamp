#!/usr/bin/env bash
# Credential plugin for Cluster Inventory.
# Reads client certificate and key from a CAPI kubeconfig secret
# and returns them as an ExecCredential JSON object.
set -euo pipefail

CLUSTER_NAME="${1:?Usage: credential-plugin.sh <cluster-name>}"
MGMT_CONTEXT="kind-headlamp-ci-hub"

base64_decode() {
  if base64 --help 2>&1 | grep -q '\-\-decode'; then
    base64 --decode
  else
    base64 -D
  fi
}

SECRET_VALUE=$(kubectl --context "${MGMT_CONTEXT}" get secret "${CLUSTER_NAME}-kubeconfig" \
  -o jsonpath='{.data.value}' | base64_decode)

CLIENT_CERT=$(echo "${SECRET_VALUE}" | yq -r '.users[0].user.client-certificate-data' | base64_decode)
CLIENT_KEY=$(echo "${SECRET_VALUE}" | yq -r '.users[0].user.client-key-data' | base64_decode)

cat <<EOF
{
  "apiVersion": "client.authentication.k8s.io/v1",
  "kind": "ExecCredential",
  "status": {
    "clientCertificateData": $(echo "${CLIENT_CERT}" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))'),
    "clientKeyData": $(echo "${CLIENT_KEY}" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')
  }
}
EOF
