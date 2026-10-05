---
title: Security
sidebar_position: 6
---

This page describes what you can and cannot expect from Headlamp in terms of
security (its security requirements), and how to deploy it securely.

To report a vulnerability, follow the process in
[SECURITY.md](https://github.com/kubernetes-sigs/headlamp/blob/main/SECURITY.md).
For the reasoning behind these requirements, including the threat model and
trust boundaries, see the [assurance case](./development/assurance-case.md).

## Security requirements

### What Headlamp does

- **Kubernetes is the authority for access control.** Headlamp acts on behalf of
  the user, using the user's own credentials (kubeconfig, bearer token, client
  certificate, or OIDC). Every read and write goes to the Kubernetes API server,
  which authenticates the request and enforces RBAC and admission control.
  By default, Headlamp never grants access that the user's credentials do not
  have. The exception is `--unsafe-use-service-account-token`: with it, every
  user of an in-cluster Headlamp acts with the permissions of Headlamp's own
  service account, whatever their own credentials allow.
- **The UI reflects permissions but does not enforce them.** Headlamp hides or
  disables actions the user is not allowed to perform, but this is only for
  convenience. Authorization is always enforced by the API server.
- **Credentials are protected in transit and at rest in the browser.** In
  in-cluster deployments, tokens are kept in `HttpOnly`, `SameSite=Strict`
  cookies that page scripts cannot read. The cookies are marked `Secure` when
  Headlamp is served over HTTPS. Sessions expire after `--session-ttl` (24 hours
  by default).
- **TLS is verified by default.** Connections to Kubernetes API servers and OIDC
  providers verify TLS certificates unless you explicitly turn this off with
  options such as `insecure-skip-tls-verify` in a kubeconfig,
  `--insecure-ssl`, or `--oidc-skip-tls-verify`.
- **Risky features are off by default.** Helm operations (`--enable-helm`),
  dynamic clusters (`--enable-dynamic-clusters`), and using the pod's own
  service account token (`--unsafe-use-service-account-token`) must be enabled
  explicitly.
- **The desktop app's local backend is protected.** The desktop app generates a
  random token on each launch. The local backend rejects requests to protected
  routes that do not present it, and checks the `Host` header when it listens
  on a loopback address to block DNS rebinding.
- **The desktop app's renderer is sandboxed.** It runs with `sandbox`,
  `contextIsolation`, and no Node.js integration, and opens external links in
  the system browser instead of inside the app.

### What Headlamp does not do

- **It does not add authentication in front of the UI.** In-cluster Headlamp
  asks users for a token or uses OIDC, but anyone who can reach the Headlamp
  service can try to log in. Do not expose Headlamp to untrusted networks
  without TLS and, where appropriate, an authenticating proxy or ingress.
- **It does not protect you from over-privileged credentials.** If you log in
  with a `cluster-admin` token, Headlamp can do everything `cluster-admin` can.
  Use least-privilege RBAC roles for Headlamp users.
- **It does not sandbox plugins.** Plugins run with the same privileges as
  Headlamp's own UI code, and can read cluster data and make API calls with the
  user's credentials. Only install plugins you trust. On the desktop, access to
  local commands requires an explicit grant (see
  [Desktop Command Capabilities](./development/plugins/command-capabilities.md)).
- **It does not secure the machine it runs on.** The desktop app reads
  kubeconfig files, and therefore credentials, from your local disk with your
  user's permissions. Anyone with access to your user account can use them.
- **It does not audit actions.** Use Kubernetes
  [audit logging](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)
  to record what users did through Headlamp.

## Deploying Headlamp securely

- Serve in-cluster Headlamp over HTTPS (see [TLS](./installation/in-cluster/tls.md)),
  and prefer OIDC login (see [OIDC](./installation/in-cluster/oidc.md)) over
  long-lived service account tokens.
- Give users and service accounts the least privilege they need.
- Use the default Helm chart security context (non-root, unprivileged), and
  consider also setting `allowPrivilegeEscalation: false`,
  `readOnlyRootFilesystem: true`, and dropping all capabilities.
- Do not use `--insecure-ssl`, `--oidc-skip-tls-verify`, or
  `--unsafe-use-service-account-token` in production.
- Keep Headlamp up to date, and subscribe to the
  [kubernetes-security-announce](https://groups.google.com/forum/#!forum/kubernetes-security-announce)
  group for security announcements.
