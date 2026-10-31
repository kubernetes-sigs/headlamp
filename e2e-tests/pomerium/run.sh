#!/usr/bin/env bash

set -euo pipefail

CLUSTER_NAME=headlamp-pomerium-e2e
CONTEXT=kind-headlamp-pomerium-e2e
NAMESPACE=headlamp-pomerium-e2e
KIND_NODE_IMAGE=kindest/node:v1.36.1
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "$SCRIPT_DIR/../.." && pwd)
GENERATED_DIR="$SCRIPT_DIR/generated"
POMERIUM_PORT_FORWARD_PID=
DEX_PORT_FORWARD_PID=
RUN_SUCCEEDED=false

cleanup() {
  if [[ -n "$POMERIUM_PORT_FORWARD_PID" ]]; then
    kill "$POMERIUM_PORT_FORWARD_PID" 2>/dev/null || true
  fi
  if [[ -n "$DEX_PORT_FORWARD_PID" ]]; then
    kill "$DEX_PORT_FORWARD_PID" 2>/dev/null || true
  fi

  if ! command -v kind >/dev/null 2>&1 || \
    ! kind get clusters | grep -Fx "$CLUSTER_NAME" >/dev/null 2>&1; then
    return
  fi

  if [[ "$RUN_SUCCEEDED" == true && "${KEEP_CLUSTER:-0}" != 1 ]]; then
    kind delete cluster --name "$CLUSTER_NAME"
  else
    echo "Cluster kept for inspection: $CLUSTER_NAME"
    echo "Delete it with: kind delete cluster --name $CLUSTER_NAME"
  fi
}
trap cleanup EXIT

for command in docker kind kubectl helm openssl npx curl; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command not found: $command" >&2
    exit 1
  fi
done

if kind get clusters | grep -Fx "$CLUSTER_NAME" >/dev/null 2>&1; then
  echo "Cluster already exists: $CLUSTER_NAME" >&2
  echo "Delete it with: kind delete cluster --name $CLUSTER_NAME" >&2
  exit 1
fi

mkdir -p "$GENERATED_DIR"

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -subj /CN=localhost.pomerium.io \
  -addext subjectAltName=DNS:localhost.pomerium.io,DNS:*.localhost.pomerium.io,DNS:dex.headlamp-pomerium-e2e.svc.cluster.local \
  -keyout "$GENERATED_DIR/tls.key" \
  -out "$GENERATED_DIR/tls.crt" >/dev/null 2>&1

kind create cluster --name "$CLUSTER_NAME" --image "$KIND_NODE_IMAGE"

kubectl --context "$CONTEXT" apply -k "$SCRIPT_DIR/pomerium"
kubectl --context "$CONTEXT" wait --namespace pomerium \
  --for=condition=complete job/pomerium-gen-secrets --timeout=180s

kubectl --context "$CONTEXT" create namespace "$NAMESPACE" --dry-run=client -o yaml | \
  kubectl --context "$CONTEXT" apply -f -
kubectl --context "$CONTEXT" create secret tls dex-e2e-tls \
  --namespace "$NAMESPACE" \
  --cert "$GENERATED_DIR/tls.crt" \
  --key "$GENERATED_DIR/tls.key"
kubectl --context "$CONTEXT" apply -f "$SCRIPT_DIR/dex.yaml"
kubectl --context "$CONTEXT" wait --namespace "$NAMESPACE" \
  --for=condition=available deployment/dex --timeout=180s

kubectl --context "$CONTEXT" create secret tls pomerium-e2e-tls \
  --namespace pomerium \
  --cert "$GENERATED_DIR/tls.crt" \
  --key "$GENERATED_DIR/tls.key"
kubectl --context "$CONTEXT" create secret generic pomerium-e2e-ca \
  --namespace pomerium \
  --from-file=ca.crt="$GENERATED_DIR/tls.crt"
kubectl --context "$CONTEXT" apply -f "$SCRIPT_DIR/pomerium-config.yaml"

kubectl --context "$CONTEXT" create secret tls headlamp-e2e-tls \
  --namespace "$NAMESPACE" \
  --cert "$GENERATED_DIR/tls.crt" \
  --key "$GENERATED_DIR/tls.key"

helm upgrade --install headlamp "$REPO_ROOT/charts/headlamp" \
  --kube-context "$CONTEXT" \
  --namespace "$NAMESPACE" \
  --values "$SCRIPT_DIR/headlamp-values.yaml" \
  --wait \
  --timeout 5m

kubectl --context "$CONTEXT" wait --namespace pomerium \
  --for=condition=available deployment/pomerium --timeout=300s

kubectl --context "$CONTEXT" --namespace pomerium \
  port-forward service/pomerium-proxy 8443:443 \
  >"$GENERATED_DIR/pomerium-port-forward.log" 2>&1 &
POMERIUM_PORT_FORWARD_PID=$!

kubectl --context "$CONTEXT" --namespace "$NAMESPACE" \
  port-forward service/dex 5556:5556 \
  >"$GENERATED_DIR/dex-port-forward.log" 2>&1 &
DEX_PORT_FORWARD_PID=$!

for attempt in $(seq 1 60); do
  if curl --fail --silent \
    --insecure https://127.0.0.1:5556/dex/.well-known/openid-configuration >/dev/null && \
    curl --fail --insecure --silent \
      --output /dev/null \
      https://headlamp.localhost.pomerium.io:8443/c/main; then
    break
  fi
  if [[ "$attempt" == 60 ]]; then
    echo "Timed out waiting for the Pomerium test stack" >&2
    exit 1
  fi
  sleep 2
done

cd "$REPO_ROOT/e2e-tests"
HEADLAMP_POMERIUM_E2E=true \
HEADLAMP_TEST_URL=https://headlamp.localhost.pomerium.io:8443 \
HEADLAMP_POMERIUM_DEX_HOST=dex.headlamp-pomerium-e2e.svc.cluster.local \
HEADLAMP_POMERIUM_SCREENSHOT="$GENERATED_DIR/pomerium-headlamp.png" \
  npx playwright test tests/pomeriumProxyAuth.spec.ts --project=chromium --reporter=line

RUN_SUCCEEDED=true
