---
title: Cluster Inventory development
---

# Cluster Inventory development

Headlamp's experimental Cluster Inventory API integration watches
`sigs.k8s.io/cluster-inventory-api v0.1.3` ClusterProfiles and creates in-memory
contexts. It is disabled by default. Enabling it requires Headlamp's global
OIDC configuration, including a client ID, issuer URL, and non-empty scopes.
See the [installation configuration](../installation/in-cluster/index.md#cluster-inventory).

Discovery runs through the [shared source engine](./cluster-discovery.md).

## Discovery and user access

| Operation | Connection and credentials |
| --- | --- |
| Watch ClusterProfiles in-cluster | Pod service account and pod namespace |
| Watch ClusterProfiles outside a cluster | Existing non-internal kubeconfig contexts and their default namespaces |
| Access a discovered Kubernetes API | Connection metadata from ClusterProfile, authenticated with the requesting user's OIDC token |

Root credentials are used for discovery only. Each access provider is converted
to an in-memory OIDC kubeconfig and loaded through the same context loader as
file-backed kubeconfigs. Generated users contain login settings, without stored
cluster credentials. Each connection has its own copy of Headlamp's OIDC settings
and source `cluster_inventory`, and cannot become a discovery root.

Headlamp trusts the connection and TLS settings published in watched
ClusterProfiles; use Kubernetes RBAC to restrict updates to ClusterProfile
status to trusted cluster managers.

Each access-provider entry with valid connection metadata appears separately in
the cluster list. Its context name ends in `-<access-provider-name>`, so a profile
with providers named `direct` and `fleet-gateway` offers two selectable connections.
The Cluster Inventory API tab shows the ClusterProfile name, resource namespace,
and access provider in separate columns. The generated context name is available
in Connection details.

Names and cluster IDs stay stable when providers are reordered or their connection
settings change. Removing a provider removes only its connection; renaming a
provider replaces that connection. There is no automatic failover between them.

For example, this connection has the suffix `-fleet-gateway` and reaches a gateway
while validating the certificate for `kubernetes.internal`:

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
query parameters, or a fragment. The CA data must be valid PEM and cannot be
combined with the insecure TLS setting. Invalid TLS settings fail proxy setup.
Invalid connection metadata removes that
provider's existing connection without affecting other valid providers. Removing
a profile or excluding it with the label selector removes all its connections.

Generated kubeconfigs are held in memory. Their names are managed by the profile
and provider names, so Headlamp does not offer renaming for these connections.
File-backed and IndexedDB-backed connections retain their existing name editing.

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
