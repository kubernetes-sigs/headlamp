# OIDC Reproduction Harness

Local kind + Dex setup for reproducing the four #5401 in-scope failure modes
before writing PR 1 code.

The point of this harness is to **prove or disprove the hypotheses in the v2
design sketch** before committing to the implementation:

1. **#4019** — does the per-process `oauthRequestMap` actually break with two
   `headlamp-server` replicas behind a round-robin proxy?
2. **#4877 / #2134** — is `history.replace(from)` at
   `frontend/src/components/authchooser/index.tsx:154,160,164` actually
   sufficient on current `main`? If yes, what's the residual? Page reload?
   Autologin? Something else?
3. **#4721** — does `selfsubjectrulesreviews` really return 201 for
   `system:unauthenticated` on the cluster shapes the reporter mentioned?
4. **#2126** — does the desktop callback land in the system browser as
   reported, and does the renderer state never update?

If any of these reproductions fail, the design changes — don't write the PR
until the repros are green-or-confirmed-already-fixed.

## Prerequisites

- `kind` (≥ 0.20)
- `kubectl`
- `docker`
- `mkcert` (optional — only if you want browser-trusted TLS for Dex; the
  default flow uses HTTP on the loopback)
- `npm` and Headlamp's normal dev dependencies (already in this repo)

## Layout

```
tools/oidc-repro/
├── README.md                      # this file
├── kind-config.yaml               # 1-node kind cluster with OIDC apiserver flags
├── dex/
│   ├── dex-config.yaml            # Dex IdP with two static users
│   └── dex-deploy.yaml            # Dex Deployment + Service in the cluster
├── headlamp/
│   ├── headlamp-config.yaml       # OIDC config for backend (OIDC_CLIENT_ID etc.)
│   ├── two-replicas.yaml          # two headlamp-server replicas behind a Service
│   └── nginx-rr.conf              # nginx round-robin in front of two replicas (for #4019)
├── scripts/
│   ├── up.sh                      # boot kind + dex + headlamp; print URLs
│   ├── down.sh                    # tear everything down
│   ├── repro-4019.sh              # multi-replica state-loss repro
│   ├── repro-4877.sh              # deep-link repro (and reload variant)
│   ├── repro-4721.sh              # SSRR-anonymous repro
│   └── repro-2126.sh              # desktop callback repro (Electron build required)
└── notes/                         # write findings here as you go
```

## Quickstart

```bash
cd tools/oidc-repro
./scripts/up.sh
```

`up.sh` boots:

- a kind cluster with `--oidc-issuer-url`, `--oidc-client-id`, and
  `--oidc-username-claim` set to point at the in-cluster Dex
- Dex with two static users (`alice@example.com` / `password`,
  `bob@example.com` / `password`) and a static client `headlamp-test`
- two `headlamp-server` replicas (built from the current checkout) behind an
  `nginx` reverse proxy that round-robins between them
- prints:
  - Dex issuer URL
  - Headlamp URL (the nginx address)
  - sample OIDC client config for `headlamp-server`

Then run any `repro-*.sh`. Each prints what it's testing, runs it, and tells
you what to look for.

## Per-issue repro recipe

### #4019 — multi-replica state loss

```
./scripts/repro-4019.sh
```

What it does:

1. Forces `nginx-rr.conf` into a deterministic alternating pattern (replica A,
   replica B, A, B…) so the `/oidc` and `/oidc-callback` requests are
   guaranteed to land on different pods.
2. Drives a headless browser through the OIDC flow.
3. Expected on `main`: callback returns 400 "unknown state" because replica B
   has no entry in its in-process `oauthRequestMap` for the state issued by
   replica A.

What you're verifying: the failure is real; the state map is process-local;
fix space is "stateless signed state" or "shared cache backend." Decision is
in the v2 sketch.

Record in `notes/4019.md`:

- exact request log showing replica routing
- whether the failure mode matches `oauthRequestMap` lookup miss specifically
  (vs. some other failure)

### #4877 / #2134 — original URL preservation

```
./scripts/repro-4877.sh
```

What it does:

1. Opens `/c/main/pods/default/<some-pod>?view=logs` while logged out.
2. Lets the existing AuthChooser handle the OIDC redirect.
3. Checks where the user lands after login.

The hypothesis from the v2 review: `authchooser/index.tsx:154,160,164` already
calls `history.replace(from)` so the popup flow may already preserve the URL.
If so, the residual must be one of:

- page **reload** of the deep-linked URL while authenticated state is missing
  (`location.state.from` is lost on reload)
- autologin / full-page redirect with no opener window
- some other path that bypasses the popup

The repro script tests both popup and reload variants. If reload preserves the
URL, the issue is fully fixed on `main` and PR 1 becomes regression coverage
only. If reload doesn't, that's the residual to design for.

Record in `notes/4877.md` what variant fails and what the URL bar shows at
each step.

### #4721 — `testAuth` false positive

```
./scripts/repro-4721.sh
```

What it does:

1. Without authenticating, hits the cluster's `selfsubjectrulesreviews`
   endpoint as `system:anonymous`.
2. Reports the HTTP status and body shape.

What you're verifying: agapoff's report — that on at least some cluster
shapes, SSRR returns 201 with empty rules for anonymous callers. If kind's
default RBAC doesn't grant SSRR to anonymous, the script also patches in the
old `system:basic-user` ClusterRoleBinding shape so the test is meaningful.

Record in `notes/4721.md` the SSRR response body for both authenticated and
anonymous callers — that's the input to the cookie-verification fix design.

### #2126 — desktop callback handoff

```
./scripts/repro-2126.sh
```

This one needs an Electron build (`npm run app:build`). The script:

1. Builds the Electron app in dev mode.
2. Configures a kubeconfig-OIDC cluster pointing at the in-cluster Dex.
3. Drives the Sign In flow.

Expected: the system browser opens, completes Dex login, lands on
`/oidc-callback` in the browser (not in Electron's renderer), and the
Electron renderer never updates. That's the failure to fix.

Record in `notes/2126.md` whether anything is in `localStorage` /
cookies on the Electron side after the system-browser flow ends.

## When to stop

Each repro is "done" when you can either:

- demonstrate the failure deterministically (and have written down the
  exact symptoms, request log, and any cookie/localStorage state), **or**
- prove the failure is no longer reproducible on current `main` (and have
  written down what changed and what residual scope remains for PR 1)

Once all four are answered, write the PR 1 design *brief* in `notes/pr1-brief.md`
based on what you found, then start coding.

## Out of scope for this harness

- #5402 sub-path A (desktop exec credentials, EKS/GKE) — needs a real cloud
  cluster; not reproducible in kind. Defer until PR 1 is in review.
- #5402 sub-path B (in-cluster impersonation) — needs PR 1's signed state +
  session-model decision first. Different harness.
