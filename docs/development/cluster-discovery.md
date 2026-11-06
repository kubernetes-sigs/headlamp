---
title: Cluster discovery sources
---

# Cluster discovery sources

Headlamp operators can discover connections from Cluster Inventory API ClusterProfiles
and Cluster API workload Clusters. Both sources produce in-memory kubeconfigs and
use the same OIDC login, kubeconfig loader, proxy, context store, and response cache
as other OIDC connections. Generated connections have no persistent kubeconfig
origin, so their names cannot be edited.

| Source                | Resources read on the management cluster                                  | Workload authentication |
| --------------------- | ------------------------------------------------------------------------- | ----------------------- |
| Cluster Inventory API | `multicluster.x-k8s.io/v1alpha1` ClusterProfiles                          | Each user's OIDC token  |
| Cluster API           | `cluster.x-k8s.io/v1beta2` Clusters and their standard kubeconfig Secrets | Each user's OIDC token  |

A management cluster's credentials are used for discovery only. In-cluster
Headlamp uses its service account and pod namespace. Outside a cluster it uses
non-internal, non-discovered kubeconfig contexts and their namespaces. Connections
created by any discovery source never become discovery roots.

Each source has independent watches and CRD availability tracking. A management
cluster can provide either API or both; one missing API does not disable the
other. Transient watch failures retry without discarding previously discovered
connections. Once caches synchronize, removed owners and invalid connections are
pruned. Names and IDs remain stable when connection settings change. Entries from
different sources remain separate even when their API server URLs match.

## Design

Sources only describe what to watch and how to turn a resource into a connection.
Everything else is shared: informer lifecycle, pruning, OIDC, the kubeconfig
loader, the context store, the proxy, the response cache, and the home page
views. A discovered connection is therefore an ordinary OIDC kubeconfig context
and follows the same path as one loaded from a kubeconfig file.

```mermaid
flowchart TD
    subgraph mgmt["Management cluster (read for discovery only)"]
        CP["ClusterProfile<br/>multicluster.x-k8s.io/v1alpha1"]
        CAPI["Cluster and its -kubeconfig Secret<br/>cluster.x-k8s.io/v1beta2"]
        NEW["Resources watched by a new source"]
    end

    subgraph adapters["Source adapters (each implements Source)"]
        A1["cluster_inventory"]
        A2["cluster_api"]
        A3["your source"]
    end

    CP --> A1
    CAPI --> A2
    NEW --> A3

    subgraph engine["Shared engine: clusterdiscovery.Runner, one per enabled source"]
        R1["Roots: in-cluster hub and<br/>non-discovered store contexts"]
        R2["Informers per namespace,<br/>owner reconcile, pruning"]
        R3["generatedOIDCConfig<br/>keep HTTPS endpoint and TLS fields,<br/>drop every credential, inject user OIDC"]
        R4["kubeconfig.LoadContextsFromAPIConfig"]
        R1 --> R2
        R2 -->|"GeneratedKubeconfig<br/>without credentials"| R3
        R3 --> R4
    end

    A1 & A2 & A3 <--> SRC{{"Source interface<br/>Watches, OwnersForChange, Build"}}
    SRC <--> R2

    R4 --> STORE[("ContextStore<br/>shared with kubeconfig,<br/>in-cluster and dynamic contexts")]

    STORE --> CFG["GET /config<br/>meta_data and clusterSources"]
    STORE --> PROXY["/clusters/:name/...<br/>requires a user token, then proxies"]
    CFG --> UI["Frontend<br/>source tabs and columns from SourceView"]
    PROXY --> CACHE["k8cache<br/>per-user SelfSubjectAccessReview,<br/>shared watch"]
```

The extension contract is the `Source` interface. The engine calls it and owns
everything the interface does not mention.

```mermaid
classDiagram
    class Registry {
        +Register(Source) error
        +Sources() []Source
    }
    class Source {
        <<interface>>
        +Descriptor() Descriptor
        +Watches(config, namespace, selector) []ResourceWatch
        +OwnersForChange(resource, obj) []NamespacedName
        +Build(root, owner, snapshot) []GeneratedKubeconfig
    }
    class Descriptor {
        +string ID
        +string DisplayName
        +GroupVersionResource Resource
        +SourceView View
    }
    class SourceView {
        +string NameLabel
        +[]SourceColumn Columns
        +[]SourceColumn DetailFields
        +[]string SummaryFields
    }
    class ResourceWatch {
        +GroupVersionResource Resource
        +InformerFactory Factory
        +SharedIndexInformer Informer
    }
    class Snapshot {
        <<interface>>
        +Get(resource, owner) object
    }
    class GeneratedKubeconfig {
        +string Key
        +string Name
        +string ClusterID
        +Config Config
        +map Metadata
        +ConnectionPresentation Presentation
    }
    class Runner {
        +Run(ctx)
    }
    Registry o-- Source
    Source <|.. clusterProfileSource
    Source <|.. clusterAPISource
    Source ..> Descriptor
    Descriptor *-- SourceView
    Source ..> ResourceWatch
    Source ..> Snapshot
    Source ..> GeneratedKubeconfig
    Runner --> Source : drives one source
    Runner ..> GeneratedKubeconfig : validates and publishes
```

## Flows

### Discovery

Each enabled source gets its own `Runner`. Roots are the in-cluster hub and, outside
a cluster, the non-internal, non-discovered contexts in the store. A root is
reconciled at start-up and then every root reconcile interval.

```mermaid
sequenceDiagram
    autonumber
    participant Main as startDiscoverySources
    participant R as Runner
    participant API as Management API server
    participant S as Source adapter
    participant St as ContextStore

    Main->>R: NewRunner(options, source) and go Run(ctx)
    loop at start and every root reconcile interval
        R->>R: reconcileRoots (hub and store roots)
        R->>R: reconcileRoot, skip if the CRD is cached as missing or the root is unchanged
        R->>S: Watches(restConfig, namespace, selector)
        S-->>R: ResourceWatch list (informers not started)
        R->>API: start informers (list and watch)
    end
    API-->>R: caches synchronized
    R->>St: RemoveContext for tracked owners missing from the synchronized cache
    loop each owner in the cache and each add, update or delete event
        API-->>R: event (resource, object)
        R->>S: OwnersForChange(resource, object)
        S-->>R: owner names
        R->>S: Build(root, owner, snapshot)
        S-->>R: GeneratedKubeconfig list (no credentials)
        R->>R: loadGenerated, inject OIDC and load as a kubeconfig context
        R->>St: AddContext
        R->>St: RemoveContext for connections the owner no longer advertises
    end
    alt owner deleted, excluded by the label selector, or Build fails
        R->>St: RemoveContext for every connection of the owner
    else watch error says the CRD is missing
        R->>R: markRootNoCRD, stop the root, prune it and skip it until the TTL expires
    end
```

A root moves through these states. A missing CRD never affects other sources
because each `Runner` keeps its own cache.

```mermaid
stateDiagram-v2
    [*] --> Desired : hub or store context is a root
    Desired --> Active : watches built and started
    Active --> Active : same server and fingerprint, nothing to do
    Active --> Active : server or credentials changed, replace the root
    Active --> NoCRD : watch error says the CRD is missing
    NoCRD --> Desired : TTL expired, next reconcile retries
    Active --> Stopped : root is no longer desired
    Stopped --> [*] : connections pruned
```

### Signing in and using a discovered connection

Discovery never stores workload credentials. Each user signs in through the
configured OIDC provider, and every request reaches the workload API server with
that user's own token. Kubernetes validates the token and applies the user's RBAC.

```mermaid
sequenceDiagram
    autonumber
    actor U as User (browser)
    participant H as Headlamp backend
    participant IdP as OIDC provider
    participant W as Workload API server

    U->>H: GET /config
    H-->>U: clusters with meta_data and clusterSources
    Note over U: the home page builds one tab per source from clusterSources

    U->>H: GET /oidc?cluster=NAME
    H-->>U: redirect to the provider (state, optional PKCE)
    U->>IdP: authenticate
    IdP-->>U: redirect to /oidc-callback with code and state
    U->>H: GET /oidc-callback
    H->>IdP: exchange the code and verify the ID token
    H-->>U: per-cluster token cookie and redirect to /auth?cluster=NAME

    U->>H: GET /clusters/NAME/api/v1/pods with the cookie
    H->>H: requireUserAuthentication, cookie becomes a bearer token and no token is a 401
    opt response cache enabled and the request is cacheable
        H->>W: SelfSubjectAccessReview with the user's token
        W-->>H: allowed or denied
        Note over H: denied returns an authorization error, allowed is served from the shared watch cache when it is current
    end
    H->>W: proxy the request with the user's bearer token
    W-->>H: response after OIDC validation and the user's RBAC
    H-->>U: response
```

## Adding a Go source

Implement `clusterdiscovery.Source` and register it in `BuiltinSources`. Registration
also exposes `enable-<source>`, `<source>-namespaces`, `<source>-label-selector`,
`<source>-root-reconcile-interval`, and `<source>-no-crd-cache-ttl` flags, with
underscores in the source ID replaced by hyphens:

- `Descriptor` supplies a stable source ID, display name, primary resource, and
  `View` with the name-column label, text columns, additional connection-detail
  fields, and compact summary fields.
- `Watches` creates unstarted informer factories and caches for a namespace.
- `OwnersForChange` maps primary or dependency events to an owner name.
- `Build` reads the cache snapshot and returns one `GeneratedKubeconfig` per
  connection, including its stable key, name, ID, public metadata, and optional
  `Presentation` display name and string fields.

Each output contains exactly one context and connection information, without
cluster credentials. The engine supplies the configured OIDC user, copies only
supported connection fields, and invokes `LoadContextsFromAPIConfig`. Sources do
not create proxies or write directly to the context store.

The engine owns informer startup, initial synchronization, shutdown, root
replacement, and connection publication and removal. Adapters can use typed or
dynamic client-go informers. Source-specific metadata is JSON; it must not contain
credentials. The source display name is returned as `meta_data.sourceLabel`. Its `View` is
returned in `/config.clusterSources`; enabled sources remain available as tabs
even when they have no connections. The frontend renders those column definitions
without source-specific components.

### What a new source touches

`backend/pkg/clusterdiscovery/extensibility_test.go` defines a source that exists only
in that file and runs it through the unmodified engine. It checks registration,
the home page view, the OIDC connection, credential removal, update and delete,
rejection of invalid output, and coexistence with the built-in sources.

| Layer | Change for a new source |
| --- | --- |
| Source adapter | One new Go file that implements `Source` |
| Registration | One line in `BuiltinSources` |
| Flags, settings and validation | None. They are generated from the descriptor for every registered source |
| Engine: roots, informers, pruning, OIDC, loader, store | None |
| Proxy, user authentication, response cache | None. They only see an OIDC kubeconfig context |
| Home page tabs, columns and details | None. They come from `Descriptor.View` |
| Translations | Optional. Labels missing from `labelTranslations` in `frontend/src/helpers/clusterPresentation.ts` are shown untranslated |
| Helm values and e2e manifests | Optional, only to expose the source there |

New sources put their public data in `GeneratedKubeconfig.Metadata`. Cluster Inventory
additionally keeps a typed `Context.ClusterInventory` field for compatibility.

## Cluster names and source views

The home page has an All tab and a tab for each available source. All shows common
status, warning, version, origin, and action columns. Source tabs add their own
fields. Column visibility, sorting, and filters are saved separately for each tab.

| Source                | Display name                 | Source columns                              |
| --------------------- | ---------------------------- | ------------------------------------------- |
| Kubeconfig            | Custom name or context name  | Cluster, context namespace, kubeconfig file |
| Cluster Inventory API | ClusterProfile resource name | Resource namespace, access provider         |
| Cluster API           | Cluster resource name        | Resource namespace, management context      |

`Cluster.name` remains the connection key for routes, authentication, saved
appearance, and recent selections. `meta_data.presentation.displayName` supplies
the human-readable name; an existing custom name takes precedence. The engine
adds the owner's namespace and management context name to `presentation.fields`; adapters
supply fields such as `provider` or `secret`. These fields contain no credentials.
A workload context's default namespace remains separate from the resource namespace.

Cluster selectors show the same display name and source summary. Identical labels
are distinguished by management context, then by connection ID. The Connection
details action shows the raw connection ID and provides a copy button. A source's
`detailFields` adds fields to this dialog without adding table columns or summary
text. Cluster API shows the kubeconfig Secret reference here. Older
servers without these definitions retain the context names and common columns.

This is a compiled Go extension point. It does not load executables or dynamically
installed Headlamp UI plugins.
