---
title: Cluster Inventory development
---

# Cluster Inventory development

:::warning Experimental alpha feature

Headlamp Cluster Inventory support is alpha/experimental and disabled by
default. The upstream Cluster Inventory API is currently `v1alpha1` and the
Headlamp integration uses the `v0.1.x` API, so fields and behavior may change.

:::

Headlamp can discover additional clusters from Cluster Inventory API
`ClusterProfile` resources when started with Cluster Inventory enabled. The
backend uses `sigs.k8s.io/cluster-inventory-api v0.1.3`, the `pkg/access`
provider configuration package, and `ClusterProfile.status.accessProviders`.

Discovery uses Kubernetes LIST/WATCH with the Headlamp pod's service account.
Added, changed, and deleted registrations are streamed to open browsers, so a
page reload is not required. Headlamp publishes only a stable opaque ID,
display name, source, and origin resource for each currently routable cluster;
API endpoints and credentials remain backend-only.

## Authentication and provider selection

`--cluster-inventory-auth-type` accepts `oidc` or `access-provider` and defaults
to `oidc`. In OIDC mode, Headlamp uses the token from the registration's origin
cluster when proxying to the discovered cluster. This does not start a separate
OIDC flow or open one browser tab per spoke. Every target API server must accept
the origin token's issuer and audience; otherwise that target returns an
authentication error.

`--cluster-inventory-access-providers` is required in both modes. It is an
ordered, comma-separated allowlist. Names are matched exactly and
case-sensitively against `status.accessProviders` (or the deprecated
`status.credentialProviders`), and the first match wins. No provider name is
special-cased.

For example, an in-cluster OIDC setup can use:

```bash
./backend/headlamp-server -in-cluster \
  --enable-cluster-inventory \
  --cluster-inventory-auth-type=oidc \
  --cluster-inventory-access-providers=shared-oidc,secondary-oidc \
  --cluster-inventory-namespaces=headlamp
```

`--cluster-inventory-provider-file` is read only in `access-provider` mode. A
provider file is required in that mode, and Headlamp limits it to the selected
provider before constructing the target connection.

For a local end-to-end environment, follow the setup in
[`e2e-tests/README.md`](https://github.com/kubernetes-sigs/headlamp/blob/main/e2e-tests/README.md).
It uses the regular E2E `test` and `test2` kind clusters and deploys Cluster
Inventory into the same Headlamp instance as the multi-cluster tests.

Explicit namespace lists, all-namespace discovery, label filtering, and
kubeconfig context namespace changes are covered by the backend tests:

```bash
npm run backend:test
```

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
  --cluster-inventory-auth-type=access-provider \
  --cluster-inventory-access-providers=static-token-spoke-a \
  --cluster-inventory-provider-file "$WORK/provider-config.json" \
  --cluster-inventory-label-selector='!headlamp.dev/ignore' \
  --cluster-inventory-namespaces=inventory-e2e \
  --cluster-inventory-root-reconcile-interval=10s \
  --cluster-inventory-no-crd-cache-ttl=30s
```

In another terminal:

```bash
npm run frontend:start
```

Without `--cluster-inventory-namespaces`, each root is watched in its own
default namespace: the pod namespace when running in-cluster, and the
kubecontext namespace (or `default`) for roots seeded from the kubeconfig.
Pass a comma-separated list to watch more than one namespace. Use `*` on its
own to watch all namespaces.

A ClusterProfile is registered only when one of the allowed providers supplies
a non-empty API server endpoint and Headlamp can construct its connection.
Removing the endpoint or allowed provider removes the registration. The
ClusterProfile object itself remains available to plugins through ordinary
Kubernetes resource hooks on the origin cluster.

## Cluster API discovery

`--enable-cluster-api` enables the same registration flow for Cluster API
Cluster resources. Headlamp prefers `cluster.x-k8s.io/v1beta2` when the API
server serves it and falls back to `cluster.x-k8s.io/v1beta1`. Headlamp reads
only `spec.controlPlaneEndpoint` and never reads the CAPI kubeconfig Secret. A
Cluster without an endpoint is not registered; it is added automatically if an
endpoint appears later.

```bash
./backend/headlamp-server -in-cluster \
  --enable-cluster-api \
  --cluster-api-namespaces=headlamp \
  --cluster-api-label-selector='!headlamp.dev/ignore'
```

The pod service account needs `list` and `watch` permission for each enabled
source in every selected namespace. All-namespace discovery requires the
equivalent cluster-wide permissions.

A cluster discovered by both sources is registered twice, once per source.

Plugins consume registrations with the `useRegisteredClusters` hook, documented in
[Plugins: Registered Clusters](https://headlamp.dev/docs/latest/development/plugins/functionality/#registered-clusters).

Install the `v0.1.3` CRD on clusters that publish inventory:

```bash
kubectl --context kind-ci-hub apply -f \
  https://raw.githubusercontent.com/kubernetes-sigs/cluster-inventory-api/v0.1.3/config/crd/bases/multicluster.x-k8s.io_clusterprofiles.yaml
```

Patch sample status with `status.accessProviders` and health conditions:

`ClusterProfile.spec.clusterManager.name` is required by the v0.1.3 CRD, even
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
