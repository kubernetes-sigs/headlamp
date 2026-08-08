#!/usr/bin/env bash

# Copyright 2026 The Kubernetes Authors
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

set -euo pipefail

CLUSTER_INVENTORY_API_VERSION="v0.1.3"
HUB_CLUSTER="test"
SPOKE_CLUSTER="test2"
HUB_CONTEXT="test"
SPOKE_CONTEXT="test2"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CREATED_CLUSTERS=false
SKIP_IMAGE_BUILD=false

log() {
  printf '\n==> %s\n' "$*"
}

usage() {
  cat <<'EOF'
Usage: ./e2e-tests/scripts/setup-multicluster.sh [--skip-image-build]

Set up the test/test2 kind clusters, Headlamp, and the Cluster Inventory fixture.

Options:
  --skip-image-build  Use Headlamp images already loaded into the clusters.
  -h, --help          Show this help.
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'error: required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

has_kind_cluster() {
  kind get clusters 2>/dev/null | grep -Fxq "$1"
}

has_kube_context() {
  kubectl config get-contexts -o name | grep -Fxq "$1"
}

context_cluster() {
  kubectl config view -o json |
    jq -r --arg context "$1" '.contexts[] | select(.name == $context) | .context.cluster'
}

cluster_ca_data() {
  kubectl --context="$1" config view --raw --minify \
    -o jsonpath='{.clusters[0].cluster.certificate-authority-data}'
}

node_ip() {
  kubectl --context="$1" get nodes \
    -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}'
}

# apply_generated renders a kubectl create command and applies it, so that reruns
# of this script do not fail on resources that already exist.
apply_generated() {
  local context="$1"
  shift

  kubectl --context="${context}" "$@" --dry-run=client -o yaml |
    kubectl --context="${context}" apply -f -
}

print_headlamp_logs() {
  if has_kube_context "${HUB_CONTEXT}"; then
    printf '\nHeadlamp pod status:\n' >&2
    kubectl --context="${HUB_CONTEXT}" -n kube-system get pods \
      -l app.kubernetes.io/name=headlamp -o wide >&2 || true
    printf '\nHeadlamp logs:\n' >&2
    kubectl --context="${HUB_CONTEXT}" -n kube-system logs \
      deployment/headlamp --all-containers --tail=200 >&2 || true
  fi
}

cleanup() {
  local status="$1"

  if [[ "${status}" -eq 0 ]]; then
    return
  fi

  print_headlamp_logs

  if [[ "${CREATED_CLUSTERS}" != true ]]; then
    return
  fi

  kind delete cluster --name "${HUB_CLUSTER}" >/dev/null 2>&1 || true
  kind delete cluster --name "${SPOKE_CLUSTER}" >/dev/null 2>&1 || true
  kubectl config delete-context "${HUB_CONTEXT}" >/dev/null 2>&1 || true
  kubectl config delete-context "${SPOKE_CONTEXT}" >/dev/null 2>&1 || true
}

trap 'status=$?; cleanup "${status}"; exit "${status}"' EXIT
trap 'exit 130' INT TERM

# wait_for_inventory blocks until discovery has converged. Which ClusterProfile is
# expected is asserted by tests/clusterInventory.spec.ts, not here.
wait_for_inventory() {
  local service_url="$1"
  local config=""
  local attempt

  for ((attempt = 0; attempt < 120; attempt++)); do
    config="$(curl -fsS --connect-timeout 2 --max-time 5 "${service_url}/config" 2>/dev/null || true)"
    if jq -e '
      [.clusters[] | select(.meta_data.source == "cluster_inventory")] | length == 1
    ' <<<"${config}" >/dev/null 2>&1; then
      return
    fi

    sleep 1
  done

  printf 'error: timed out waiting for a discovered ClusterProfile\n' >&2
  jq -c '[.clusters[] | select(.meta_data.source == "cluster_inventory")]' \
    <<<"${config}" >&2 || printf '%s\n' "${config}" >&2
  return 1
}

write_playwright_env() {
  local service_url="$1"
  local spoke_token="$2"
  local env_file
  local hub_token
  local -a env_values

  hub_token="$(
    kubectl --context="${HUB_CONTEXT}" -n kube-system \
      create token headlamp-admin --duration=24h
  )"
  env_values=(
    "HEADLAMP_TEST_URL=${service_url}"
    "HEADLAMP_TEST_TOKEN=${hub_token}"
    "HEADLAMP_TEST2_TOKEN=${spoke_token}"
    "HEADLAMP_TEST_BACKEND_TOKEN=headlamp"
    "HEADLAMP_CLUSTER_INVENTORY_E2E=true"
  )

  if [[ -n "${GITHUB_ENV:-}" ]]; then
    printf '::add-mask::%s\n' "${hub_token}" "${spoke_token}"
    printf '%s\n' "${env_values[@]}" >>"${GITHUB_ENV}"
    log "Playwright environment added to GITHUB_ENV"
    return
  fi

  env_file="${REPO_ROOT}/e2e-tests/.env"
  (
    umask 077
    printf '%s\n' "${env_values[@]}" >"${env_file}"
  )
  chmod 600 "${env_file}"
  log "Playwright environment written to e2e-tests/.env"
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-image-build)
      SKIP_IMAGE_BUILD=true
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

for command in curl docker envsubst grep jq kind kubectl uname; do
  require_command "${command}"
done
if [[ "${SKIP_IMAGE_BUILD}" != true ]]; then
  require_command make
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  printf 'error: this E2E currently supports Linux only\n' >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  printf 'error: Docker is not running or is not accessible\n' >&2
  exit 1
fi

cluster_count=0
context_count=0
for cluster in "${HUB_CLUSTER}" "${SPOKE_CLUSTER}"; do
  if has_kind_cluster "${cluster}"; then
    ((cluster_count += 1))
  fi
done
for context in "${HUB_CONTEXT}" "${SPOKE_CONTEXT}"; do
  if has_kube_context "${context}"; then
    ((context_count += 1))
  fi
done

if [[ "${cluster_count}" -eq 0 && "${context_count}" -eq 0 ]]; then
  log "Create kind clusters ${HUB_CLUSTER} and ${SPOKE_CLUSTER}"
  CREATED_CLUSTERS=true
  kind create cluster --name "${HUB_CLUSTER}"
  kubectl config rename-context "kind-${HUB_CLUSTER}" "${HUB_CONTEXT}"
  kind create cluster --name "${SPOKE_CLUSTER}"
  kubectl config rename-context "kind-${SPOKE_CLUSTER}" "${SPOKE_CONTEXT}"
elif [[ "${cluster_count}" -eq 2 && "${context_count}" -eq 2 ]]; then
  log "Reuse kind clusters ${HUB_CLUSTER} and ${SPOKE_CLUSTER}"
else
  printf '%s\n' \
    "error: expected both kind clusters and contexts (${HUB_CLUSTER}, ${SPOKE_CLUSTER}), or none" \
    "found ${cluster_count} clusters and ${context_count} contexts" >&2
  exit 1
fi

if [[ "$(context_cluster "${HUB_CONTEXT}")" != "kind-${HUB_CLUSTER}" ||
  "$(context_cluster "${SPOKE_CONTEXT}")" != "kind-${SPOKE_CLUSTER}" ]]; then
  printf 'error: the test contexts do not refer to the matching kind clusters\n' >&2
  exit 1
fi

for context in "${HUB_CONTEXT}" "${SPOKE_CONTEXT}"; do
  kubectl --context="${context}" wait --for=condition=Ready node --all --timeout=180s
done

if [[ "${SKIP_IMAGE_BUILD}" != true ]]; then
  log "Build and load the Headlamp images"
  cd "${REPO_ROOT}"
  export BUILDKIT_PROGRESS="${BUILDKIT_PROGRESS:-plain}"
  DOCKER_IMAGE_VERSION=latest make image
  DOCKER_IMAGE_VERSION=latest \
    DOCKER_PLUGINS_IMAGE_NAME=headlamp-plugins-test \
    make build-plugins-container

  kind load docker-image \
    ghcr.io/headlamp-k8s/headlamp-plugins-test:latest \
    ghcr.io/headlamp-k8s/headlamp:latest --name "${HUB_CLUSTER}"
  # The in-cluster API spec runs Headlamp on the spoke cluster too.
  kind load docker-image \
    ghcr.io/headlamp-k8s/headlamp:latest --name "${SPOKE_CLUSTER}"
fi

log "Configure access to both clusters"
for context in "${HUB_CONTEXT}" "${SPOKE_CONTEXT}"; do
  apply_generated "${context}" -n kube-system create serviceaccount headlamp-admin
  apply_generated "${context}" create clusterrolebinding headlamp-admin \
    --serviceaccount=kube-system:headlamp-admin \
    --clusterrole=cluster-admin
done

log "Create a workload on ${SPOKE_CLUSTER}"
apply_generated "${SPOKE_CONTEXT}" create namespace inventory-demo
apply_generated "${SPOKE_CONTEXT}" -n inventory-demo create deployment inventory-demo \
  --image=registry.k8s.io/pause:3.10.1
kubectl --context="${SPOKE_CONTEXT}" -n inventory-demo \
  rollout status deployment/inventory-demo --timeout=300s

log "Install the Cluster Inventory API on ${HUB_CLUSTER}"
kubectl --context="${HUB_CONTEXT}" apply -f \
  "https://raw.githubusercontent.com/kubernetes-sigs/cluster-inventory-api/${CLUSTER_INVENTORY_API_VERSION}/config/crd/bases/multicluster.x-k8s.io_clusterprofiles.yaml"
kubectl --context="${HUB_CONTEXT}" wait --for=condition=Established \
  crd/clusterprofiles.multicluster.x-k8s.io --timeout=120s

HUB_NODE_IP="$(node_ip "${HUB_CONTEXT}")"
TEST_CA_DATA="$(cluster_ca_data "${HUB_CONTEXT}")"
TEST_SERVER="https://${HUB_NODE_IP}:6443"
TEST2_CA_DATA="$(cluster_ca_data "${SPOKE_CONTEXT}")"
TEST2_SERVER="https://$(node_ip "${SPOKE_CONTEXT}"):6443"
INVENTORY_SPOKE_TOKEN="$(
  kubectl --context="${SPOKE_CONTEXT}" -n kube-system \
    create token headlamp-admin --duration=24h
)"
export TEST_CA_DATA TEST_SERVER TEST2_CA_DATA TEST2_SERVER INVENTORY_SPOKE_TOKEN

log "Deploy Headlamp and the inventory-test2 ClusterProfile on ${HUB_CLUSTER}"
envsubst \
  '${TEST_CA_DATA} ${TEST_SERVER} ${TEST2_CA_DATA} ${TEST2_SERVER} ${INVENTORY_SPOKE_TOKEN}' \
  <"${REPO_ROOT}/e2e-tests/kubernetes-headlamp-ci.yaml" |
  kubectl --context="${HUB_CONTEXT}" apply -f -

SPOKE_VERSION="$(
  kubectl --context="${SPOKE_CONTEXT}" version -o json |
    jq -r '.serverVersion.gitVersion'
)"
STATUS_PATCH="$(
  jq -cn \
    --arg server "${TEST2_SERVER}" \
    --arg ca "${TEST2_CA_DATA}" \
    --arg version "${SPOKE_VERSION}" \
    '{
      status: {
        version: {kubernetes: $version},
        accessProviders: [{
          name: "headlamp-e2e-token",
          cluster: {
            server: $server,
            "certificate-authority-data": $ca
          }
        }]
      }
    }'
)"
kubectl --context="${HUB_CONTEXT}" -n kube-system \
  patch clusterprofile inventory-test2 \
  --subresource=status --type=merge -p "${STATUS_PATCH}"

kubectl --context="${HUB_CONTEXT}" -n kube-system \
  wait deployment/headlamp --for=condition=Available=True --timeout=180s

SERVICE_PORT="$(
  kubectl --context="${HUB_CONTEXT}" -n kube-system get service headlamp \
    -o jsonpath='{.spec.ports[0].nodePort}'
)"
SERVICE_URL="http://${HUB_NODE_IP}:${SERVICE_PORT}"

log "Wait for Cluster Inventory discovery at ${SERVICE_URL}"
wait_for_inventory "${SERVICE_URL}"
write_playwright_env "${SERVICE_URL}" "${INVENTORY_SPOKE_TOKEN}"

log "Multi-cluster E2E environment is ready at ${SERVICE_URL}"
