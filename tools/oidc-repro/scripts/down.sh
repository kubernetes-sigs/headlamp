#!/usr/bin/env bash
set -euo pipefail
CLUSTER_NAME=headlamp-oidc-repro

if kind get clusters | grep -qx "$CLUSTER_NAME"; then
  echo "==> Deleting kind cluster $CLUSTER_NAME"
  kind delete cluster --name "$CLUSTER_NAME"
else
  echo "no cluster $CLUSTER_NAME; nothing to do"
fi
