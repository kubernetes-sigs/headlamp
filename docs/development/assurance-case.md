---
title: Security Assurance Case
sidebar_label: Assurance Case
---

This document explains why we believe Headlamp meets its
[security requirements](../security.md). It describes the threat model, the
trust boundaries, how secure design principles are applied, and how common
implementation weaknesses are countered.

It complements the [architecture](./architecture.md) document. Please keep it
up to date when making changes that affect authentication, authorization,
plugin loading, or how Headlamp communicates with clusters.

## System overview

Headlamp has three main parts (see [architecture](./architecture.md)):

- **Frontend**: a React single-page application that renders the UI and runs
  plugins.
- **Backend** (`headlamp-server`): a Go HTTP server that serves the frontend,
  proxies requests to Kubernetes API servers, and provides helper services
  (plugins, Helm, port forwarding, OIDC).
- **Desktop app**: an Electron shell that starts the backend locally, manages
  plugins on disk, and loads the frontend in a sandboxed window.

Headlamp is deployed either **in-cluster**, as a web service shared by many
users, or as a **desktop app** for a single local user.

## Threat model

### Assets

1. Kubernetes credentials: kubeconfig files, bearer tokens, client
   certificates, OIDC tokens, and the in-cluster service account token.
2. Integrity and confidentiality of cluster resources and data (including
   Secrets) that the user can access.
3. Integrity of the code Headlamp runs: release artifacts, container images,
   and plugins.
4. The local machine running the desktop app.

### Threat actors

- **Unauthenticated network attackers** who can reach an in-cluster Headlamp
  service, or who try to intercept its traffic.
- **Authenticated but low-privilege users** who try to do more than their RBAC
  permissions allow.
- **Malicious websites** visited by a Headlamp user, which try to send
  requests to Headlamp from the browser (CSRF, DNS rebinding, cross-site
  WebSocket requests), especially to the desktop app's local backend.
- **Malicious or compromised plugins**, and attackers who try to replace
  plugin downloads.
- **Malicious cluster content**, such as resource names, labels, annotations,
  or logs crafted to attack the UI (for example, with XSS).
- **Supply-chain attackers** who try to tamper with dependencies, the build, or
  release artifacts.

### Out of scope

- An attacker who already controls the user's operating-system account, or the
  node or pod running Headlamp.
- A compromised Kubernetes API server or OIDC provider.
- Users who knowingly install malicious plugins or turn off security options
  (for example `--insecure-ssl`).

## Trust boundaries

| # | Boundary | Untrusted side | Controls |
| --- | --- | --- | --- |
| 1 | Browser ↔ in-cluster backend | Network and other websites | TLS (recommended for deployments), `HttpOnly` and `SameSite=Strict` auth cookies (also `Secure` over HTTPS), session TTL, no CORS outside development mode |
| 2 | Renderer ↔ local desktop backend | Other local processes and websites | Per-launch random backend token compared in constant time, `Host` header check on loopback addresses (against DNS rebinding) |
| 3 | Backend ↔ Kubernetes API server | Network | TLS with certificate verification by default. The API server authenticates every request and enforces RBAC and admission |
| 4 | Headlamp ↔ plugins | Plugin code | Plugins are installed only by an administrator or user. Desktop downloads are limited to allowlisted hosts and checked against checksums. Local command execution requires a grant in the product manifest |
| 5 | UI ↔ cluster data | Resource content created by other users | React escapes rendered output. The YAML editor and log viewer render text, not HTML |
| 6 | Desktop main process ↔ renderer | Web content in the renderer | `sandbox`, `contextIsolation`, no `nodeIntegration`, a narrow preload API, external links opened in the system browser |
| 7 | Project ↔ users (supply chain) | Distribution channels | Dependencies, GitHub Actions, and base images pinned by hash or digest, build provenance attestations for container images, signed Helm charts, and Apple code signing and notarization |

## Secure design principles

These are the [Saltzer and Schroeder](https://web.mit.edu/Saltzer/www/publications/protection/)
principles and how Headlamp applies them:

- **Economy of mechanism.** Headlamp does not implement its own authorization.
  The backend is mostly a thin proxy that forwards the user's credentials to the
  Kubernetes API server, which reduces the security-critical code Headlamp has
  to maintain.
- **Fail-safe defaults.** Risky options are off by default: Helm operations,
  dynamic clusters, use of the pod's service account token, and skipping TLS
  verification. In the UI, if a permission check fails or cannot be completed,
  the action is not offered.
- **Complete mediation.** Every request to cluster resources goes through the
  Kubernetes API server, which authenticates and authorizes it. UI permission
  checks are only for convenience and are never relied on for enforcement.
- **Open design.** Headlamp is fully open source, and its security relies on
  standard, published mechanisms (Kubernetes RBAC, OIDC, TLS), not on
  secrecy of the design.
- **Separation of privilege.** Pull requests need approval from a reviewer and
  a maintainer, as listed in the
  [OWNERS](https://github.com/kubernetes-sigs/headlamp/blob/main/OWNERS) file.
  On the desktop, a plugin needs both to be installed and to be granted access
  in the product manifest before it can run local commands.
- **Least privilege.** Users act with their own Kubernetes credentials. The
  container runs as a non-root user, and the Helm chart's default security
  context is non-root and unprivileged. The Electron renderer runs sandboxed
  without Node.js access.
- **Least common mechanism.** In-cluster sessions are per user and per cluster
  (separate cookies per cluster), and the backend does not share one privileged
  identity between users unless the administrator explicitly enables it.
- **Psychological acceptability.** The UI hides actions that the user cannot
  perform. Secure defaults mean users do not need extra configuration to be
  safe, and insecure options are clearly named (for example `--insecure-ssl`
  and `--unsafe-use-service-account-token`).

## Countering common implementation weaknesses

The table below maps the [OWASP Top 10](https://owasp.org/www-project-top-ten/)
and [CWE Top 25](https://cwe.mitre.org/top25/) weaknesses that are relevant to
Headlamp to how they are countered.

| Weakness | How it is countered |
| --- | --- |
| Memory safety errors (CWE-787, CWE-125, CWE-416) | The backend is written in Go and the frontend and desktop app in TypeScript, all memory-safe languages. Headlamp's own code contains no C or C++ |
| Cross-site scripting (CWE-79) | React escapes all rendered values. Production frontend code does not use `dangerouslySetInnerHTML`. Cluster data is shown as text, including in the YAML editor and the log viewer |
| Cross-site request forgery (CWE-352) | Auth cookies are `SameSite=Strict`. The desktop backend requires a secret token header that cross-site pages cannot send. CORS is only enabled in development mode |
| Injection, OS command injection (CWE-77, CWE-78, CWE-89) | There is no SQL database. Exec into containers goes through the Kubernetes exec API, not a local shell. Desktop local commands use argument arrays (no shell) and need an explicit grant |
| Path traversal (CWE-22) | Static file paths are normalized and checked so that they stay inside their base directory (`backend/pkg/spa/pathSafety.go`). Plugin names containing path separators or `..` are rejected |
| Missing authentication or authorization (CWE-306, CWE-862, CWE-863) | The Kubernetes API server authorizes every request. The desktop backend token protects local routes |
| Improper input validation (CWE-20) | Inputs are checked against allowlists where Headlamp itself uses them: bearer token characters, cluster names in cookies, plugin names and download hosts, URL paths, and configuration flags. Kubernetes objects are validated by the API server against their schemas and admission policies |
| Server-side request forgery (CWE-918) | The backend only proxies to clusters configured by the administrator or user. Adding clusters at runtime (dynamic clusters) is disabled by default. Desktop plugin and tool downloads are limited to allowlisted hosts |
| Exposure of sensitive information (CWE-200, CWE-532) | Tokens are kept in `HttpOnly` cookies that page scripts cannot read. Responses containing user identity are sent with `Cache-Control: no-store` |
| Improper certificate validation (CWE-295) | TLS verification is on by default. Turning it off requires an explicit option |
| Timing side channels on secrets (CWE-208) | The backend token is compared with `crypto/subtle.ConstantTimeCompare` |
| Vulnerable and outdated components (OWASP A06) | Dependencies are pinned with lock files. GitHub Actions and container base images are pinned by digest. `govulncheck` (run by `releaser security-check`) detects known vulnerabilities in Go dependencies. JavaScript dependencies have no automated vulnerability check yet; maintainers periodically run `npm audit fix` and update affected dependencies. OpenSSF Scorecard monitors the repository |
| Software and data integrity failures (OWASP A08) | Helm charts are signed, container images come with build provenance attestations, and the macOS app is signed and notarized. Desktop plugin archives are checked against checksums from Artifact Hub |

## Verification activities

- **Code review.** Every change is reviewed and approved by project maintainers
  before merging.
- **Static analysis.** `golangci-lint` (including `gosec`) for the backend and
  ESLint with TypeScript type checking for the frontend and desktop app run on
  every pull request.
- **Testing.** Unit, Storybook snapshot, integration, and end-to-end tests run in
  CI. These include tests for authentication, cookie handling, path safety,
  backend token checks, and OIDC flows. See the
  [testing policy](../contributing.md#testing-policy).
- **Fuzzing.** Backend fuzz tests are available with `make backend-fuzz`.
- **Supply-chain checks.** [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/kubernetes-sigs/headlamp)
  runs on the repository. `releaser security-check` checks the Go backend for
  known vulnerabilities with `govulncheck` and lints the Dockerfiles with
  `hadolint`.
- **Vulnerability response.** Reports are handled privately through the
  Kubernetes Security Response Committee process described in
  [SECURITY.md](https://github.com/kubernetes-sigs/headlamp/blob/main/SECURITY.md).
