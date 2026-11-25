#!/usr/bin/env bash

set -euo pipefail

NAMESPACE="${NAMESPACE:-headlamp-doa}"
RELEASE="${RELEASE:-headlamp}"
SERVICE="${SERVICE:-headlamp}"

echo "=================================="
echo " Headlamp DoA Test"
echo "=================================="

echo "[1/5] Checking namespace..."
kubectl get namespace "$NAMESPACE"

echo "[2/5] Checking Helm release..."
helm status "$RELEASE" -n "$NAMESPACE"

echo "[3/5] Checking deployment readiness..."
kubectl rollout status deployment/"$RELEASE" \
  -n "$NAMESPACE" --timeout=120s

echo "[4/5] Checking pod readiness..."
READY_PODS=$(kubectl get pods -n "$NAMESPACE" \
  -l app.kubernetes.io/instance="$RELEASE" \
  -o jsonpath='{range .items[*]}{.status.containerStatuses[*].ready}{"\n"}{end}' \
  | grep -c true || true)

if [ "$READY_PODS" -lt 1 ]; then
  echo "ERROR: No ready Headlamp pod found."
  exit 1
fi

echo "Ready pod(s): $READY_PODS"

echo "[5/5] Checking service endpoints..."
ENDPOINTS=$(kubectl get endpoints "$SERVICE" -n "$NAMESPACE" \
  -o jsonpath='{.subsets[*].addresses[*].ip}')

if [ -z "$ENDPOINTS" ]; then
  echo "ERROR: No service endpoints found."
  exit 1
fi

echo "Service endpoint(s): $ENDPOINTS"

echo "=================================="
echo " ALL TESTS PASSED"
echo "=================================="
