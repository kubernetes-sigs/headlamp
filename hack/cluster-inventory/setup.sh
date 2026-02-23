#!/usr/bin/env bash
# Setup script for Cluster Inventory development environment.
# Creates a CAPI management cluster with k0smotron (hosted control plane) +
# Docker provider (CAPD) workload cluster, installs ClusterProfile CRD,
# and generates credential plugin + provider config for testing Headlamp's
# cluster inventory feature.
#
# k0smotron advantages over plain CAPD:
#   - CNI (kube-router) is built into k0s, no manual Calico install needed
#   - Control plane runs as pods in the management cluster (no cloud-provider-kind needed)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

MANAGEMENT_CLUSTER_NAME="headlamp-ci-hub"
WORKLOAD_CLUSTER_NAME="workload-1"
K0S_VERSION="${K0S_VERSION:-v1.34.3+k0s.0}"
# Kubernetes version without the +k0s.0 suffix (used for MachineDeployment and ClusterProfile)
K8S_VERSION="${K0S_VERSION%%+*}"

# --- Helpers ---

info()  { echo "==> $*"; }
warn()  { echo "WARNING: $*" >&2; }
error() { echo "ERROR: $*" >&2; exit 1; }

# Portable base64 decode (macOS vs Linux)
base64_decode() {
  if base64 --help 2>&1 | grep -q '\-\-decode'; then
    base64 --decode
  else
    base64 -D
  fi
}

check_command() {
  if ! command -v "$1" &>/dev/null; then
    error "'$1' is required but not found. Please install it first."
  fi
}

# --- Step 1: Prerequisites ---

info "Checking prerequisites..."
for cmd in kind kubectl clusterctl docker yq; do
  check_command "$cmd"
done

if ! docker info &>/dev/null; then
  error "Docker daemon is not running. Please start Docker first."
fi

info "All prerequisites satisfied."

# --- Step 2: Kind management cluster ---

if kind get clusters 2>/dev/null | grep -q "^${MANAGEMENT_CLUSTER_NAME}$"; then
  info "Kind cluster '${MANAGEMENT_CLUSTER_NAME}' already exists, skipping creation."
else
  info "Creating Kind management cluster '${MANAGEMENT_CLUSTER_NAME}'..."
  # CAPD needs access to the host Docker socket to provision worker nodes.
  kind create cluster --name "${MANAGEMENT_CLUSTER_NAME}" --config - <<'KIND_EOF'
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
- role: control-plane
  extraMounts:
    - hostPath: /var/run/docker.sock
      containerPath: /var/run/docker.sock
KIND_EOF
fi

kubectl config use-context "kind-${MANAGEMENT_CLUSTER_NAME}"

# --- Step 3: CAPI Docker Provider + k0smotron ---

# clusterctl init installs cert-manager automatically, which k0smotron needs.
info "Installing Cluster API with Docker infrastructure provider..."
clusterctl init --infrastructure docker

info "Waiting for CAPI controllers to be ready..."
kubectl wait --for=condition=Available deployment --all -n capi-system --timeout=120s
kubectl wait --for=condition=Available deployment --all -n capd-system --timeout=120s

info "Installing k0smotron (operator + CAPI bootstrap/control-plane providers)..."
kubectl apply --server-side=true -f https://docs.k0smotron.io/v1.10.3/install.yaml

info "Waiting for k0smotron controllers to be ready (webhook cert may take a moment)..."
kubectl wait --for=condition=Available deployment --all -n k0smotron --timeout=300s

# --- Step 4: Workload cluster ---

if kubectl get cluster "${WORKLOAD_CLUSTER_NAME}" &>/dev/null; then
  info "Workload cluster '${WORKLOAD_CLUSTER_NAME}' already exists, skipping creation."
else
  info "Creating workload cluster '${WORKLOAD_CLUSTER_NAME}' (k0smotron HCP + CAPD workers)..."
  kubectl apply -f - <<EOF
apiVersion: cluster.x-k8s.io/v1beta1
kind: Cluster
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}
  namespace: default
spec:
  clusterNetwork:
    pods:
      cidrBlocks:
      - 192.168.0.0/16
    serviceDomain: cluster.local
    services:
      cidrBlocks:
      - 10.128.0.0/12
  controlPlaneRef:
    apiVersion: controlplane.cluster.x-k8s.io/v1beta1
    kind: K0smotronControlPlane
    name: ${WORKLOAD_CLUSTER_NAME}-cp
    namespace: default
  infrastructureRef:
    apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
    kind: DockerCluster
    name: ${WORKLOAD_CLUSTER_NAME}
    namespace: default
---
apiVersion: controlplane.cluster.x-k8s.io/v1beta1
kind: K0smotronControlPlane
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}-cp
  namespace: default
spec:
  version: ${K0S_VERSION}
  persistence:
    type: emptyDir
  service:
    type: LoadBalancer
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerCluster
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}
  namespace: default
  annotations:
    cluster.x-k8s.io/managed-by: k0smotron
spec: {}
---
apiVersion: cluster.x-k8s.io/v1beta1
kind: MachineDeployment
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}-md
  namespace: default
spec:
  clusterName: ${WORKLOAD_CLUSTER_NAME}
  replicas: 1
  selector:
    matchLabels:
      cluster.x-k8s.io/cluster-name: ${WORKLOAD_CLUSTER_NAME}
      pool: worker-pool-1
  template:
    metadata:
      labels:
        cluster.x-k8s.io/cluster-name: ${WORKLOAD_CLUSTER_NAME}
        pool: worker-pool-1
    spec:
      clusterName: ${WORKLOAD_CLUSTER_NAME}
      version: ${K8S_VERSION}
      bootstrap:
        configRef:
          apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
          kind: K0sWorkerConfigTemplate
          name: ${WORKLOAD_CLUSTER_NAME}-machine-config
      infrastructureRef:
        apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
        kind: DockerMachineTemplate
        name: ${WORKLOAD_CLUSTER_NAME}-mt
---
apiVersion: infrastructure.cluster.x-k8s.io/v1beta1
kind: DockerMachineTemplate
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}-mt
  namespace: default
spec:
  template:
    spec: {}
---
apiVersion: bootstrap.cluster.x-k8s.io/v1beta1
kind: K0sWorkerConfigTemplate
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}-machine-config
spec:
  template:
    spec:
      version: ${K0S_VERSION}
EOF
fi

info "Waiting for k0smotron control plane to become available (this may take several minutes)..."
kubectl wait k0smotroncontrolplane "${WORKLOAD_CLUSTER_NAME}-cp" \
  --for=jsonpath='{.status.ready}'=true \
  --timeout=600s

info "Waiting for kubeconfig secret to appear..."
until kubectl get secret "${WORKLOAD_CLUSTER_NAME}-kubeconfig" &>/dev/null; do
  sleep 5
done

info "Retrieving workload cluster kubeconfig..."
WORKLOAD_KUBECONFIG="${SCRIPT_DIR}/workload-kubeconfig"
clusterctl get kubeconfig "${WORKLOAD_CLUSTER_NAME}" > "${WORKLOAD_KUBECONFIG}"

info "Waiting for machines to be created and running..."
until kubectl get machine -l cluster.x-k8s.io/cluster-name="${WORKLOAD_CLUSTER_NAME}" 2>/dev/null | grep -q .; do
  sleep 5
done
kubectl wait machine -l cluster.x-k8s.io/cluster-name="${WORKLOAD_CLUSTER_NAME}" \
  --for=jsonpath='{.status.phase}'=Running \
  --timeout=600s

info "Waiting for workload cluster nodes to become Ready..."
kubectl --kubeconfig="${WORKLOAD_KUBECONFIG}" wait nodes --all \
  --for=condition=Ready \
  --timeout=300s || warn "Some nodes may not be Ready yet. Continuing anyway."

# --- Step 5: ClusterProfile CRD ---

info "Installing ClusterProfile CRD on management cluster..."

CRD_URL="https://raw.githubusercontent.com/kubernetes-sigs/cluster-inventory-api/main/config/crd/bases/multicluster.x-k8s.io_clusterprofiles.yaml"

# Try local Go module cache first, fall back to remote
CRD_LOCAL="$(go env GOMODCACHE)/sigs.k8s.io/cluster-inventory-api@v0.0.0-20260205073429-aefe60b86bb4/config/crd/bases/multicluster.x-k8s.io_clusterprofiles.yaml"
if [[ -f "${CRD_LOCAL}" ]]; then
  info "Using ClusterProfile CRD from local Go module cache."
  kubectl apply -f "${CRD_LOCAL}"
else
  info "Downloading ClusterProfile CRD from GitHub..."
  kubectl apply -f "${CRD_URL}"
fi

kubectl wait --for=condition=Established crd clusterprofiles.multicluster.x-k8s.io --timeout=30s

# --- Step 6: ClusterProfile resource ---

info "Creating ClusterProfile for '${WORKLOAD_CLUSTER_NAME}'..."

# Extract connection info from the CAPI-managed kubeconfig secret
SECRET_DATA=$(kubectl get secret "${WORKLOAD_CLUSTER_NAME}-kubeconfig" -o jsonpath='{.data.value}' | base64_decode)
SERVER_URL=$(echo "${SECRET_DATA}" | yq -r '.clusters[0].cluster.server')
CA_DATA=$(echo "${SECRET_DATA}" | yq -r '.clusters[0].cluster.certificate-authority-data')

# Create the ClusterProfile (spec only)
kubectl apply -f - <<EOF
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ClusterProfile
metadata:
  name: ${WORKLOAD_CLUSTER_NAME}
  namespace: default
spec:
  clusterManager:
    name: capi-docker
EOF

# Status is a subresource, so it must be patched separately.
kubectl patch clusterprofile "${WORKLOAD_CLUSTER_NAME}" \
  --type merge --subresource=status -p "$(cat <<EOF
{
  "status": {
    "version": {
      "kubernetes": "${K8S_VERSION}"
    },
    "accessProviders": [
      {
        "name": "capi-secret",
        "cluster": {
          "server": "${SERVER_URL}",
          "certificate-authority-data": "${CA_DATA}"
        }
      }
    ]
  }
}
EOF
)"

# --- Step 7: credential-plugin.sh ---

info "Generating credential plugin script..."

CREDENTIAL_PLUGIN="${SCRIPT_DIR}/credential-plugin.sh"
cat > "${CREDENTIAL_PLUGIN}" <<'PLUGIN_EOF'
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
PLUGIN_EOF

chmod +x "${CREDENTIAL_PLUGIN}"

# --- Step 8: provider-config.json ---

info "Generating provider config..."

PROVIDER_CONFIG="${SCRIPT_DIR}/provider-config.json"
cat > "${PROVIDER_CONFIG}" <<EOF
{
  "providers": [
    {
      "name": "capi-secret",
      "execConfig": {
        "apiVersion": "client.authentication.k8s.io/v1",
        "command": "${CREDENTIAL_PLUGIN}",
        "args": ["${WORKLOAD_CLUSTER_NAME}"],
        "provideClusterInfo": false
      }
    }
  ]
}
EOF

# --- Step 9: Done ---

info ""
info "============================================================"
info " Cluster Inventory dev environment is ready!"
info "============================================================"
info ""
info "Generated files:"
info "  - ${CREDENTIAL_PLUGIN}"
info "  - ${PROVIDER_CONFIG}"
info "  - ${WORKLOAD_KUBECONFIG} (debug)"
info ""
info "To start Headlamp with Cluster Inventory support:"
info ""
info "  cd ${REPO_ROOT}"
info "  make backend"
info "  ./backend/headlamp-server \\"
info "    --kubeconfig ~/.kube/config \\"
info "    --enable-cluster-inventory \\"
info "    --cluster-inventory-provider-file ${PROVIDER_CONFIG} \\"
info "    --cluster-inventory-rescan-interval 1m"
info ""
info "Then open http://localhost:4466 and look for"
info "  'cluster-inventory-default--${WORKLOAD_CLUSTER_NAME}' in the cluster list."
info ""
info "To clean up: ${SCRIPT_DIR}/teardown.sh"
