---
title: Cluster Inventory development
---

# Cluster Inventory development

Headlamp's experimental Cluster Inventory integration watches
`sigs.k8s.io/cluster-inventory-api v0.1.3` ClusterProfiles and creates in-memory
contexts. It is disabled by default. Enabling it requires Headlamp's global
OIDC configuration, including a client ID, issuer URL, and non-empty scopes.
See the [installation configuration](../installation/in-cluster/index.md#cluster-inventory).

## Discovery and user access

| Operation | Connection and credentials |
| --- | --- |
| Watch ClusterProfiles in-cluster | Pod service account and pod namespace |
| Watch ClusterProfiles outside a cluster | Existing non-internal kubeconfig contexts and their default namespaces |
| Access a discovered Kubernetes API | Connection metadata from ClusterProfile, authenticated with the requesting user's OIDC token |

Root credentials are used for discovery only. Discovered contexts have empty
`AuthInfo`, their own copy of Headlamp's OIDC settings, and source
`cluster_inventory`. They cannot become discovery roots. Context names and
cluster IDs remain stable across updates to the same profile.

Headlamp trusts the connection and TLS settings published in watched
ClusterProfiles; use Kubernetes RBAC to restrict updates to ClusterProfile
status to trusted cluster managers.

The first access-provider entry with a non-empty server is selected in profile
order. For example, this connection reaches a gateway while validating the
certificate for `kubernetes.internal`:

```yaml
apiVersion: multicluster.x-k8s.io/v1alpha1
kind: ClusterProfile
metadata:
  name: spoke-a
  namespace: inventory-team-a
spec:
  clusterManager:
    name: fleet-controller
status:
  accessProviders:
    - name: fleet-gateway
      cluster:
        server: https://gateway.example.com/clusters/spoke-a/kubernetes
        tls-server-name: kubernetes.internal
```

Headlamp copies inline CA data, TLS server name, TLS verification settings,
proxy URL, and compression settings. It ignores local certificate file paths
and exec extensions. The server must use HTTPS without embedded credentials,
query parameters, or a fragment. Invalid selected connection metadata removes
an existing discovered context; Headlamp does not fall through to a different
provider. Removing a profile or excluding it with the label selector also
removes its context.

## Configuration

| Flag | Behavior |
| --- | --- |
| `--enable-cluster-inventory` | Enables discovery and requires user OIDC authentication for discovered clusters |
| `--cluster-inventory-namespaces=inventory-team-a,inventory-team-b` | Watches the listed namespaces instead of each root's default namespace |
| `--cluster-inventory-namespaces='*'` | Watches all namespaces; cannot be combined with namespace names |
| `--cluster-inventory-label-selector='!headlamp.dev/ignore'` | Excludes labelled profiles; this is the Helm default |
| `--cluster-inventory-root-reconcile-interval=10s` | Overrides the five-minute root reconciliation interval |
| `--cluster-inventory-no-crd-cache-ttl=30s` | Overrides the two-hour cache for roots without the ClusterProfile CRD |

Provider files and exec authentication are unsupported. User requests without a
token are rejected before cache access or cluster proxying. The regular OIDC
login and refresh flow is shared with other OIDC contexts, and each discovered
API server must trust the configured issuer and client.

## Tests

`npm run backend:test` covers discovery, namespace and label selection,
connection validation, updates, deletion, and user authentication. The
[existing multi-cluster E2E fixture](../../e2e-tests/README.md#cluster-inventory)
uses Dex and verifies user-specific RBAC through HTTP and WebSocket requests.
