---
title: Cluster API discovery
---

# Cluster API discovery

Headlamp operators can enable automatic discovery of `cluster.x-k8s.io/v1beta2`
Clusters. Connections use the same [discovery engine](./cluster-discovery.md) as
Cluster Inventory and authenticate each signed-in user through OIDC.

| Backend option | Environment variable | Behavior |
| --- | --- | --- |
| `--enable-cluster-api` | `HEADLAMP_CONFIG_ENABLE_CLUSTER_API` | Enables discovery; disabled by default |
| `--cluster-api-namespaces=workload-team-a` | `HEADLAMP_CONFIG_CLUSTER_API_NAMESPACES` | Selects management namespaces; empty uses each root's default namespace and `*` selects all |
| `--cluster-api-label-selector='!headlamp.dev/ignore'` | `HEADLAMP_CONFIG_CLUSTER_API_LABEL_SELECTOR` | Filters Cluster resources; this selector is the Helm default |
| `--cluster-api-root-reconcile-interval=10s` | `HEADLAMP_CONFIG_CLUSTER_API_ROOT_RECONCILE_INTERVAL` | Overrides the five-minute root reconciliation interval |
| `--cluster-api-no-crd-cache-ttl=30s` | `HEADLAMP_CONFIG_CLUSTER_API_NO_CRD_CACHE_TTL` | Overrides the two-hour cache for roots without the v1beta2 Cluster API |

Global OIDC client ID, issuer URL, and non-empty scopes are required. Each workload
API server must trust that issuer and client. By default, root configurations are
checked every five minutes; management servers without the v1beta2 Cluster API are
retried after two hours. There is no v1beta1 fallback.

For a Cluster named `spoke-a` in `workload-team-a`, Headlamp reads the Secret
`workload-team-a/spoke-a-kubeconfig`. It must have:

- Type `cluster.x-k8s.io/secret`.
- Label `cluster.x-k8s.io/cluster-name: spoke-a`.
- A `data.value` containing the workload kubeconfig.

The kubeconfig's `current-context` selects the connection. If it is absent, the
kubeconfig must contain exactly one context. Headlamp copies the HTTPS endpoint,
inline CA, TLS server name, TLS verification setting, proxy URL, compression
setting, and default namespace. It ignores local file paths, exec extensions,
and all user credentials in the Secret. Those credentials do not authenticate
workload requests and are never returned in discovery metadata. A Secret whose
CA is not valid PEM, or is combined with the insecure TLS setting, produces no
connection.

The management identity needs `get`, `list`, and `watch` on Cluster API `clusters`
and core `secrets` in the selected namespaces. Restrict access to the management
resources to trusted operators: changes to them change the discovered endpoint.

One Cluster creates one connection named `cluster-api-<root-and-cluster-key>--<hash>`,
with ID `cluster-api/<root>/<namespace>/<cluster-name>`. The name and ID are stable
across Secret updates. Deleting the Cluster or Secret, invalidating its connection,
or excluding the Cluster with the selector removes its connection. Restoring the
resources restores it. Generated kubeconfigs are held in memory and cannot be
renamed in Headlamp.
