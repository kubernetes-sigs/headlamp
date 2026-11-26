#!/usr/bin/env bash

set -euo pipefail

NAMESPACE="${NAMESPACE:-headlamp-doa}"
RELEASE="${RELEASE:-headlamp}"

echo "Uninstalling Headlamp..."

if helm status "$RELEASE" -n "$NAMESPACE" >/dev/null 2>&1; then
  helm uninstall "$RELEASE" -n "$NAMESPACE" --wait
else
  echo "Helm release not found; skipping Helm uninstall."
fi

if kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
  kubectl delete namespace "$NAMESPACE" --wait=true
else
  echo "Namespace not found; skipping namespace deletion."
fi

echo "Headlamp cleanup completed."
