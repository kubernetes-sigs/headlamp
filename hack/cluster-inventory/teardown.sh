#!/usr/bin/env bash
# Teardown script for Cluster Inventory development environment.
# Deletes the Kind management cluster and removes generated files.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MANAGEMENT_CLUSTER_NAME="headlamp-ci-hub"

info()  { echo "==> $*"; }

# --- Delete Kind cluster ---

if kind get clusters 2>/dev/null | grep -q "^${MANAGEMENT_CLUSTER_NAME}$"; then
  info "Deleting Kind cluster '${MANAGEMENT_CLUSTER_NAME}'..."
  kind delete cluster --name "${MANAGEMENT_CLUSTER_NAME}"
else
  info "Kind cluster '${MANAGEMENT_CLUSTER_NAME}' does not exist, skipping."
fi

# --- Clean up generated files ---

info "Removing generated files..."
rm -f "${SCRIPT_DIR}/provider-config.json"
rm -f "${SCRIPT_DIR}/workload-kubeconfig"

info ""
info "Teardown complete."
