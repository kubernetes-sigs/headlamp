---
title: In-cluster Plugin Manager
sidebar_label: Plugin Manager
---

The in-cluster plugin manager installs plugins at runtime on every replica of
a Headlamp deployment, without restarting any pods. It solves the problem that
plugins in a clustered deployment otherwise have to be baked into the image or
copied around manually per pod.

## How it works

The desired state (which catalogs exist and which plugins should be installed)
lives in a ConfigMap in Headlamp's own namespace. Every replica watches this
ConfigMap and reconciles its local user plugins directory against it:
downloads are verified with a sha256 checksum, extracted safely and picked up
by the plugin watcher, which hot-reloads the frontend. New replicas converge
automatically on startup, so every pod is an exact mirror of the desired
state.

The UI (a "Plugin Manager" entry in the cluster sidebar with the tabs
"Installed Plugins", "Plugin Browser" and "Catalog Settings") writes the
ConfigMap through the Kubernetes API **with the logged-in user's own
credentials**. Whoever lacks permission to update that ConfigMap cannot
install, uninstall or reconfigure plugins. Headlamp's own service account only
needs read access to it.

## Enabling it

Add these flags to the Headlamp container:

```
-enable-plugin-manager
-plugin-manager-configmap=headlamp-plugin-manager
-user-plugins-dir=/headlamp/user-plugins
```

Mount a writable volume (an `emptyDir` is fine) at the user plugins directory
and give the service account read access to the ConfigMap. For private
catalogs (see below) the service account also needs `get` on Secrets:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: headlamp-plugin-manager-read
  namespace: headlamp
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get"]
```

Note: `-watch-plugins-changes` stays enabled by default with the plugin
manager so installed plugins reload without a restart. Disabling it
explicitly (flag or environment variable) turns hot-reload off.

### Security model

The backend fetches the catalog and plugin archive URLs listed in the
ConfigMap, so whoever can write that ConfigMap decides which URLs the
Headlamp pods contact — including endpoints that are only reachable from
inside the cluster. Treat write access to the ConfigMap (and to the catalog
Secrets) as equivalent to controlling which plugins run in Headlamp, and
restrict it with RBAC to the same people who may deploy Headlamp itself. If
that is not restrictive enough for your environment, limit the pods' egress
with a NetworkPolicy to the registries you trust.

## Catalogs

Two catalog types are supported:

- `artifacthub`: browses Headlamp plugins on [Artifact Hub](https://artifacthub.io)
  (or a self-hosted instance). Archive URL and checksum come from the package
  metadata.
- `index`: a static JSON file served over HTTP(S), e.g. from a Nexus OSS
  raw/hosted repository, an S3 bucket or any web server:

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "displayName": "My Plugin",
      "description": "Does things",
      "version": "1.0.0",
      "archiveUrl": "https://nexus.example.com/repository/plugins/my-plugin-1.0.0.tar.gz",
      "checksum": "sha256:0123...cdef",
      "homepage": "https://example.com/my-plugin"
    }
  ]
}
```

The archive must be a `.tar.gz` containing the plugin's `main.js` and
`package.json`, either at the archive root or inside a single top-level
directory (the format produced by `headlamp-plugin package`).

## TLS for self-signed catalogs

An `https` catalog served with a certificate that the pods do not trust (a
self-signed Nexus is the common case) can be configured per catalog, both in
the UI (Catalog Settings) and directly in the state:

- `caCert`: a PEM-encoded CA certificate that is trusted in addition to the
  system roots. This is the recommended option — verification stays on.
- `insecureSkipTlsVerify`: disables certificate verification entirely. Off by
  default; use only when you cannot provide a CA certificate.

Both settings apply to browsing the catalog **and** to downloading the plugins
listed in it, so a plugin hosted on the same self-signed Nexus installs
without a certificate error.

```json
{
  "id": "nexus",
  "name": "Company Nexus",
  "type": "index",
  "url": "https://nexus.internal/repository/headlamp-plugins/index.json",
  "caCert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"
}
```

For an `index` catalog you may enter just the repository URL; the manager
appends `/index.json` automatically, and the Catalog Settings dialog has a
**Search for index** button that probes for the index below the given URL.

## Private catalogs (authentication)

A catalog behind HTTP Basic auth (a private Nexus repository) stores its
username inline and its password in a Kubernetes Secret in Headlamp's
namespace — never in the ConfigMap:

```json
{
  "id": "nexus",
  "name": "Company Nexus",
  "type": "index",
  "url": "https://nexus.internal/repository/headlamp-plugins/index.json",
  "username": "headlamp",
  "passwordSecret": "headlamp-catalog-nexus"
}
```

The referenced Secret must contain a `password` key:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: headlamp-catalog-nexus
  namespace: headlamp
stringData:
  password: "s3cret"
```

The Catalog Settings dialog manages this Secret for you: tick **Requires
authentication** and enter the credentials. The password is written to the
Secret with your own credentials, and the same auth applies to browsing the
catalog and downloading its plugins. Headlamp's service account needs `get`
on Secrets (see the Role above).

## Desired state format

The ConfigMap holds one key, `state.json`:

```json
{
  "catalogs": [
    {"id": "artifacthub", "name": "Artifact Hub", "type": "artifacthub", "url": "https://artifacthub.io"}
  ],
  "plugins": [
    {
      "name": "headlamp_kubescape",
      "version": "0.11.2",
      "archiveUrl": "https://github.com/kubescape/headlamp-plugin/releases/download/v0.11.2/....tar.gz",
      "checksum": "sha256:ed9a...c40",
      "catalog": "artifacthub"
    }
  ]
}
```

Editing this ConfigMap directly (e.g. via GitOps) works exactly like using the
UI; the replicas reconcile either way. Plugins installed by other means (baked
into the image, initContainers) are never touched: the manager only manages
directories it created itself.
