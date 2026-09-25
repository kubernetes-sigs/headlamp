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

# Tear the harness down: delete the kind cluster, the harness kubeconfig, and
# the locally built image.
set -euo pipefail

# shellcheck source=./common.sh
source "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/common.sh"

if kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"; then
  echo "==> Deleting kind cluster $CLUSTER_NAME"
  # Because the harness has its own kubeconfig, this cannot strand the
  # developer's current-context the way `kind delete` against ~/.kube/config
  # does (it unsets current-context rather than restoring the previous one).
  kind delete cluster --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG"
else
  echo "no cluster $CLUSTER_NAME; nothing to do"
fi

if [ -f "$KUBECONFIG" ]; then
  echo "==> Removing $KUBECONFIG"
  rm -f "$KUBECONFIG"
fi

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "==> Removing image $IMAGE"
  docker image rm "$IMAGE" >/dev/null || true
fi

echo "Done. Notes under $NOTES_DIR are left in place."
