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

# Shared setup for every script in this harness. Source it, don't execute it.
#
# The important part is KUBECONFIG: the harness writes and reads its own
# kubeconfig file and never touches ~/.kube/config. Without this, a second
# up.sh run -- or any run after `kubectl config use-context prod` -- would
# apply this harness's cluster-admin ClusterRoleBinding to whatever cluster
# happened to be current.

# Resolve paths from this file's location, not the caller's CWD, so the
# scripts work from the repo root, from tools/oidc-repro, or from anywhere.
COMMON_SH_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
REPRO_DIR="$( dirname "$COMMON_SH_DIR" )"
# REPO_ROOT and IMAGE are used by up.sh and down.sh, which source this file.
# shellcheck disable=SC2034
REPO_ROOT="$( cd "$REPRO_DIR/../.." && pwd )"

CLUSTER_NAME=headlamp-oidc-repro
CTX="kind-${CLUSTER_NAME}"
# shellcheck disable=SC2034
IMAGE=headlamp:repro

# Ports. Both are NodePorts on the kind node's InternalIP -- see the platform
# note in README.md for why this harness is Linux-only.
HEADLAMP_NODEPORT=30080
DEX_NODEPORT=30556

# Harness-local kubeconfig. Gitignored.
export KUBECONFIG="$REPRO_DIR/.kubeconfig"

NOTES_DIR="$REPRO_DIR/notes"

# Absolute path to a notes file, with the directory created on demand.
# Usage: NOTES=$(notes_file 4019.md)
notes_file() {
  mkdir -p "$NOTES_DIR"
  echo "$NOTES_DIR/$1"
}

# Fail early with an actionable message rather than emitting confusing
# kubectl errors from four different scripts.
require_cluster() {
  if ! kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
    echo "error: kind cluster '$CLUSTER_NAME' does not exist." >&2
    echo "       Run ./scripts/up.sh first." >&2
    exit 1
  fi

  if [ ! -f "$KUBECONFIG" ]; then
    echo "error: $KUBECONFIG is missing. Run ./scripts/up.sh first." >&2
    exit 1
  fi
}

# The kind node's InternalIP. Routable from the host on Linux + Docker, and
# from inside pods, which is what lets one issuer URL satisfy both the browser
# and headlamp-server.
node_ip() {
  kubectl --context "$CTX" get nodes \
    -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'
}

headlamp_url() { echo "http://$(node_ip):${HEADLAMP_NODEPORT}"; }
dex_issuer_url() { echo "http://$(node_ip):${DEX_NODEPORT}/dex"; }
