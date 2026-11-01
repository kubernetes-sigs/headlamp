# OIDC reproduction harness

A local kind cluster running [Dex](https://dexidp.io/) and two
`headlamp-server` replicas behind a round-robin nginx, for reproducing
Headlamp's OIDC login problems against a real IdP.

Two replicas is the point: several of these issues only appear when the request
that starts a login and the request that completes it are handled by different
processes.

## Platform support

**Linux with Docker.** Not Docker Desktop, not macOS, not Windows.

The reason is specific. go-oidc validates the `iss` claim, so the issuer URL
must be byte-identical from the browser and from inside the `headlamp-server`
pods. This harness satisfies that with the kind node's InternalIP
(`http://<node-ip>:30556/dex`), which on Linux is routable both from the host
and from inside the cluster. On Docker Desktop the node network is not
host-routable, so no single URL works for both, and `kubectl port-forward`
does not help — it fixes the browser's side and breaks the pods'.

Making this cross-platform needs a hostname that resolves in both places: an
`/etc/hosts` entry on the host, `extraPortMappings` in the kind config, and
`hostAliases` on the Headlamp pods pointing at Dex's ClusterIP. That has not
been done here.

## Prerequisites

- `kind` (≥ 0.20)
- `kubectl`
- `docker`

`up.sh` builds the Headlamp image from the current checkout, so a normal
working tree is all you need — no separate frontend or backend build first.

The image build accepts explicit source metadata. `up.sh` passes the current
`git rev-parse HEAD` as `HEADLAMP_SOURCE_COMMIT`, so linked worktrees work too.
`REPRO_SKIP_BUILD=1` reuses an existing `headlamp:repro` image instead; it does
not check whether that image matches the current checkout.

## Running it

```bash
cd tools/oidc-repro
./scripts/up.sh
```

That takes a few minutes on a cold cache, mostly the image build. When it
finishes it prints the Headlamp URL and Dex issuer. Test-only users and client
credentials are documented in the committed [Dex fixture](dex/dex-config.yaml),
not echoed by the scripts. Do not reuse them outside this disposable stack.

**Check callback completion separately from Kubernetes authentication.**
Open Headlamp in a private window and use the committed Dex fixture. A callback
may fail if it crosses replicas (#4019). Even a successful callback does **not**
mean the UI can authenticate to Kubernetes: this API server deliberately does
not trust Dex tokens. Rejection or a return to the login screen is expected;
do not enable an unsafe ServiceAccount fallback or add API-server OIDC trust
just to make the UI usable.

Tear down with `./scripts/down.sh`, which deletes the cluster, the harness
kubeconfig, and the locally built image.

### The harness has its own kubeconfig

Every script defaults to `tools/oidc-repro/.kubeconfig` and ignores ambient
`KUBECONFIG`, including path lists. To select a different **dedicated disposable
file**, set `REPRO_KUBECONFIG=/absolute/path/to/disposable-kubeconfig` on every
harness invocation, including teardown. Never point it at an existing personal
kubeconfig; `up.sh` writes it and `down.sh` deletes it. The caller is responsible
for keeping the override isolated. Scripts never use `~/.kube/config`.

To poke at the cluster yourself:

```bash
export KUBECONFIG="$PWD/.kubeconfig"  # or the same dedicated REPRO_KUBECONFIG file
kubectl get pods -A
```

## What `up.sh` builds

| Piece | Detail |
|---|---|
| kind cluster | `headlamp-oidc-repro`, single node. The apiserver's own OIDC flags are **not** set — see `kind-config.yaml` for why. |
| Dex | Two static users and a static client `headlamp-test`; credentials in the committed Dex fixture. NodePort 30556. |
| `headlamp-server` | Two Deployments, `hl-a` and `hl-b`, one replica each, so nginx can address them individually. |
| nginx | Round-robin over both replicas, NodePort 30080. Adds `X-Upstream-Addr` so a script can tell which replica answered. |

The issuer URL, the OIDC callback URL, and Dex's registered redirect URI all
depend on the node IP, which does not exist until the cluster does. `up.sh`
derives them after cluster creation and substitutes them into the Dex config
and the `headlamp-oidc` ConfigMap. The committed manifests carry placeholders,
so applying them directly with `kubectl apply -f` will not give you a working
stack — go through `up.sh`.

`-dev` is deliberately not passed to either replica. In dev mode the
post-callback redirect is hardcoded to `http://localhost:3000/`, where nothing
is listening here, and CORS is relaxed to allow all origins. Both would look
like the bugs under investigation.

## Layout

```
tools/oidc-repro/
├── README.md
├── kind-config.yaml            # single-node kind cluster
├── dex/
│   ├── dex-config.yaml         # Dex config; issuer + redirect URI templated by up.sh
│   └── dex-deploy.yaml         # Dex Namespace, Deployment, NodePort Service
├── headlamp/
│   ├── two-replicas.yaml       # hl-a, hl-b, nginx, RBAC, placeholder ConfigMaps
│   └── nginx-rr.conf           # round-robin config, mounted by up.sh
└── scripts/
    ├── common.sh               # shared paths + harness-local KUBECONFIG
    ├── up.sh
    ├── down.sh
    ├── repro-4019.sh
    ├── repro-4877.sh
    ├── repro-4721.sh
    └── repro-2126.sh
```

Scripts write to `tools/oidc-repro/notes/`, which is gitignored and created on
demand. Each run appends rather than overwrites, so repeated runs stay
comparable. Notes contain status, upstreams and sanitized observations only:
never paste OAuth URLs, query strings, callback bodies, tokens or cookies.
nginx access logs retain method, path, HTTP status and upstream, not query
strings or referers; raw nginx error logging is suppressed for the same reason.

## The repro scripts

Each script explains its own hypothesis in its header, prints what it observed,
and appends a notes template. Run them from anywhere; paths resolve from the
script location, not the working directory.

| Issue | Current recipe status (not a live verification claim) |
|---|---|
| #4019 | Process-local state mechanism still relevant; curl checks cross-replica state misses. |
| #4721 | SSRR API-contract comparison only, not a full UI reproduction. |
| #4877 / #2134 | Historical popup return bug fixed; full-page completion explicitly navigates. Three manual variants retained as checks, not claimed failures. |
| #2126 | Existing desktop recipe manual and unverified; isolated desktop setup required separately. |

### `repro-4019.sh` — [#4019](https://github.com/kubernetes-sigs/headlamp/issues/4019)

Automated. Drives the full authorization-code flow with curl: `GET /oidc`
through nginx, submits Dex's login form, then `GET /oidc-callback` through
nginx again. Reports which replica handled each request and what the callback
returned.

The hypothesis is that pending OAuth requests live in a process-local map keyed
by `state`, so a callback landing on the other replica fails with HTTP 400
`invalid request`. The script reports REPRODUCED only when the two requests
demonstrably hit different replicas and the response matches the state-map miss.
This mechanism remains in current `headlamp-server`. The script defaults to
the public fixture password; set `USER_PASSWORD_FILE` to a private file only
when using another test password. The script copies only
the first line to a temporary private file and removes it on exit; curl reads
the password from that file, not argv. Redirect URLs and callback bodies are
withheld from output and notes.

### `repro-4877.sh` — [#4877](https://github.com/kubernetes-sigs/headlamp/issues/4877) / [#2134](https://github.com/kubernetes-sigs/headlamp/issues/2134)

Manual recipe. Prints three variants of "open a deep link, sign in, see where
you land": popup, direct navigation to the login route (which reaches
AuthChooser with no `location.state.from`), and full-page redirect with no
opener.
Current popup completion restores the deep link via `history.replace(from)`.
Direct login with no return intent falls back to the cluster root; that is
expected, not a residual deep-link bug. Reloading a history entry does not by
itself lose its `from` state. Direct full-page completion explicitly navigates
to the cluster route when no stored return URL exists; it no longer depends on
an opener. Record routing separately from replica failures and expected API
server token rejection. These browser variants remain unverified here.

### `repro-4721.sh` — [#4721](https://github.com/kubernetes-sigs/headlamp/issues/4721)

Automated. Grants `system:basic-user` to `system:unauthenticated` to create the
reported cluster shape, then POSTs `selfsubjectrulesreviews` from inside a pod
as three callers: anonymous, an unbound ServiceAccount, and the cluster-admin
ServiceAccount Headlamp runs as.

The comparison that matters is anonymous against the *unbound* account. It is
deliberately given no RoleBinding: it still receives `system:basic-user` and
`system:discovery` through the default `system:authenticated` bindings, which
makes it the hardest case to tell apart from anonymous. Granting it even
something small like `view` would guarantee workload rules anonymous lacks, and
the difference would then come from RBAC rather than from authentication —
the exact confusion this issue is about. Against cluster-admin the two
responses differ for uninteresting reasons; the real question is whether an
anonymous response can be told apart from a legitimately unprivileged one by
shape alone.

The anonymous grant, probe pod and comparison account are removed on exit,
including when the script fails partway. Tokens travel on stdin into curl
configuration, not curl argv. This examines the contract used by Headlamp's
2xx auth probe; it does not drive anonymous access through the full UI.

### `repro-2126.sh` — [#2126](https://github.com/kubernetes-sigs/headlamp/issues/2126)

Existing manual recipe, **unverified**. Before any desktop run, prepare a
separate disposable OIDC kubeconfig and isolate both Headlamp persistence and
the Electron profile. The kind admin kubeconfig is not an OIDC desktop config,
and a `KUBECONFIG` override alone does not isolate desktop persistence. No
verified isolated desktop launch/setup is supplied here; do not start an app
against ambient kubeconfig or an existing profile. The script describes only
the observations to make after those prerequisites have been met.

## Limitations

- The apiserver does not validate Dex tokens. These reproductions exercise
  Headlamp's OIDC *client*, not Kubernetes' OIDC authenticator. Anything that
  needs the apiserver to accept a Dex-issued token — impersonation, token-based
  RBAC — needs an issuer running *outside* this cluster and already serving
  JWKS when `kind create cluster` runs. The harness's own Dex is an in-cluster
  Deployment and cannot fill that role, whatever order you do things in. The
  commented `kubeadmConfigPatches` block in `kind-config.yaml` has the details.
- PKCE is off. `headlamp-server` only sends a code challenge when started with
  `-oidc-use-pkce`; add it to `headlamp/two-replicas.yaml` if you need it.
- Everything is plain HTTP. No TLS anywhere, which rules out reproducing
  Secure-cookie or mixed-content problems.
- Single node, so this says nothing about behaviour under a real load balancer
  with session affinity.
