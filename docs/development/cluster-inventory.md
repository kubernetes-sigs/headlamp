---
title: Cluster Inventory development
---

# Cluster Inventory development

Headlamp can discover additional clusters from Cluster Inventory API
`ClusterProfile` resources when started with Cluster Inventory enabled. The
backend uses `sigs.k8s.io/cluster-inventory-api v0.1.0`, the `pkg/access`
provider configuration package, and `ClusterProfile.status.accessProviders`.

The provider configuration file is not a `ClusterProfile` status object. It uses
the upstream access configuration shape with a top-level `providers` array:

```json
{
  "providers": [
    {
      "name": "static-token-spoke-a",
      "execConfig": {
        "apiVersion": "client.authentication.k8s.io/v1",
        "command": "/tmp/headlamp-ci/static-token-exec.sh",
        "provideClusterInfo": true
      }
    }
  ]
}
```

Start the backend explicitly while testing:

```bash
npm run backend:build
KUBECONFIG="$WORK/hub.kubeconfig" \
HEADLAMP_BACKEND_TOKEN=headlamp \
HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS=true \
./backend/headlamp-server -dev -listen-addr=localhost \
  --enable-cluster-inventory \
  --cluster-inventory-provider-file "$WORK/provider-config.json" \
  --cluster-inventory-label-selector='!headlamp.dev/ignore' \
  --cluster-inventory-root-reconcile-interval=10s \
  --cluster-inventory-no-crd-cache-ttl=30s
```

In another terminal:

```bash
npm run frontend:start
```

Install the `v0.1.0` CRD on clusters that publish inventory:

```bash
kubectl --context kind-ci-hub apply -f \
  https://raw.githubusercontent.com/kubernetes-sigs/cluster-inventory-api/v0.1.0/config/crd/bases/multicluster.x-k8s.io_clusterprofiles.yaml
```

Patch sample status with `status.accessProviders` and health conditions:

`ClusterProfile.spec.clusterManager.name` is required by the v0.1.0 CRD, even
when the access details are patched later through the status subresource. The
CRD also requires `reason` on each condition, so include it even when adapting
examples that omit the field.

```bash
kubectl --context kind-ci-hub -n inventory-e2e apply -f - <<'EOF'
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ClusterProfile
metadata:
  name: spoke-a
spec:
  clusterManager:
    name: headlamp-local-e2e
EOF

kubectl --context kind-ci-hub -n inventory-e2e patch clusterprofiles spoke-a \
  --subresource=status --type=merge \
  -p "$(jq -n --arg server "$SPOKE_A_SERVER" --arg ca "$SPOKE_A_CA" '{
    status: {
      conditions: [{
        type: "ControlPlaneHealthy",
        status: "True",
        reason: "HealthCheckSucceeded",
        message: "control plane endpoint is ready",
        lastTransitionTime: "2026-05-10T00:00:00Z"
      }],
      accessProviders: [{
        name: "static-token-spoke-a",
        cluster: {
          server: $server,
          "certificate-authority-data": $ca
        }
      }]
    }
  }')"
```

To hide a `ClusterProfile` from Headlamp, add the ignore label. The default
Helm chart selector is `!headlamp.dev/ignore`, so profiles with that label are
not watched or converted into Headlamp contexts:

```bash
kubectl --context kind-ci-hub -n inventory-e2e label clusterprofile spoke-a \
  headlamp.dev/ignore=true
```

Run the focused web E2E only after the local topology is running:

```bash
cd e2e-tests
HEADLAMP_CLUSTER_INVENTORY_E2E=true \
HEADLAMP_TEST_URL=http://localhost:3000 \
npx playwright test -g "Cluster Inventory"
```

Before cleanup, verify that setup artifacts stayed outside tracked paths:

```bash
git status --short
```
