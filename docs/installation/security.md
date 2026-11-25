---
title: Security Requirements and Expectations
sidebar_label: Security
sidebar_position: 6
---

Headlamp is a Kubernetes web UI and desktop application that forwards user
credentials to Kubernetes API servers, optionally manages Helm releases and
kubeconfigs, and loads user-installed plugins. This page summarizes the security
requirements and operational expectations for deploying and running Headlamp.

For vulnerability reporting and supported versions, see the
[Security Policy](https://github.com/kubernetes-sigs/headlamp/blob/main/SECURITY.md).

## Deployment modes and network exposure

Headlamp has two primary deployment models with different trust boundaries:

- **In-cluster (`-in-cluster`):** Runs as a web service inside Kubernetes. Users
  authenticate per request with their own credentials (bearer token, OIDC, or
  an authenticating proxy). Keep `-enable-dynamic-clusters`,
  `-allow-kubeconfig-changes`, and `-enable-helm` disabled unless explicitly
  needed, and do not expose an unauthenticated instance to untrusted networks.
- **Desktop / local (`headlamp-server`):** Runs locally for a single user. The
  desktop app generates a random `HEADLAMP_BACKEND_TOKEN` on launch and passes
  it to the backend (`X-HEADLAMP_BACKEND-TOKEN` header or WebSocket subprotocol).
  When running `headlamp-server` standalone, bind to loopback
  (`-listen-addr=127.0.0.1`) and set `HEADLAMP_BACKEND_TOKEN` if protected
  cluster, plugin, Helm, or proxy routes could be reached by other local users
  or processes. See [Backend token protection](../development/backend.md#backend-token-protection).

## Authentication and RBAC

- **Per-user credentials:** Headlamp relies on Kubernetes
  [RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac) to
  enforce authorization. Configure
  [OIDC](./in-cluster/oidc.md),
  user-supplied bearer tokens, or an
  [identity-aware proxy](./in-cluster/identity-aware-proxy.md) (`-proxy-auth`
  only behind a trusted proxy that strips and sets the configured headers).
  With `-proxy-auth`, identity headers only identify the user to the UI; when
  per-user Kubernetes authorization is required, the proxy must also forward a
  Kubernetes-accepted user token via `-proxy-auth-token-header` (default
  `X-Forwarded-Id-Token`), rather than relying on the pod's shared
  ServiceAccount.
- **Avoid shared service-account fallback:** Do not enable
  `-unsafe-use-service-account-token` in multi-user or untrusted environments;
  it disables per-user authentication and uses the pod's service account token
  for all users.
- **Least-privilege service account:** When running in-cluster, grant the
  Headlamp pod's own ServiceAccount only the permissions required for its
  configured features (for example, `SelfSubjectReview` / discovery or
  cluster-inventory access if enabled). Note that the Helm chart binds the
  pod's ServiceAccount to `cluster-admin` by default
  (`clusterRoleBinding.clusterRoleName`); replace it with a reviewed
  least-privilege role before production use.

## Transport security (TLS)

- **Always use HTTPS in-cluster:** Terminate TLS at your Ingress/Gateway or
  directly at the Headlamp backend using `-tls-cert-path` / `-tls-key-path`
  (`HEADLAMP_CONFIG_TLS_CERT_PATH` / `HEADLAMP_CONFIG_TLS_KEY_PATH`). See
  [TLS and TLS pass through](./in-cluster/tls.md).
- **Verify upstream certificates:** Never enable `-insecure-ssl`,
  `-oidc-skip-tls-verify`, or `-oidc-api-proxy-skip-tls-verify` in production
  deployments.

## External proxies, Helm, and iframe embedding

- **External proxy allowlist (`-proxy-urls`):** Keep `-proxy-urls` unset or
  restricted to narrow, explicitly trusted external URL patterns (such as
  `https://artifacthub.io/*` if needed). Because this setting controls
  server-side fetches, never use catch-all patterns or patterns that can reach
  loopback, link-local/metadata, or cluster-internal services.
- **Helm repositories and charts:** When `-enable-helm` is enabled, Headlamp
  restricts repository URLs to `http://` and `https://` and install/upgrade
  requests to `<repository>/<chart>` from registered repositories, but does not
  constrain which HTTP(S) repository URLs (including internal/localhost targets)
  can be registered, accepts `insecureSkipTLSverify`, and allows a registered
  repository's index to reference arbitrary chart URLs. Register only trusted
  HTTPS repositories, keep repository TLS verification enabled, and review
  charts before installing or upgrading.
- **Backstage / iframe embedding (`-backstage-origin`):** By default, Headlamp
  rejects Backstage `window.postMessage` events and does not broadcast
  `HEADLAMP_READY`. Set `-backstage-origin` / `HEADLAMP_CONFIG_BACKSTAGE_ORIGIN`
  (or build-time `REACT_APP_BACKSTAGE_ORIGIN`) to an explicit comma-separated
  list of trusted `http://` or `https://` origins only when embedding Headlamp
  in Backstage.

## Plugins and release verification

- **Plugin trust:** Frontend plugins run in the Headlamp browser/Electron
  origin with access to the user's session and UI capabilities. Only install or
  mount plugins from trusted sources, and keep `-watch-plugins-changes` disabled
  in production in-cluster deployments. See the
  [Plugin development guide](../development/plugins/index.md).
- **Verify releases:** Verify container images, desktop installers, and Helm
  charts using their published signatures and SLSA provenance as described in
  [Verifying Releases](./verify-releases.md).
