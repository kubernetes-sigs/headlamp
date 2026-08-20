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

The build needs a real `.git` **directory**: the Dockerfile does `COPY .git/`
because `frontend/make-env.js` runs `git rev-parse HEAD`. In a linked `git
worktree` `.git` is a file, so the build cannot run there. `up.sh` detects this
and tells you to build from the main checkout and re-run with
`REPRO_SKIP_BUILD=1`, which reuses an existing `headlamp:repro` image instead of
rebuilding. That variable is also just a time-saver on repeat runs — the image
takes minutes to build and rarely needs to change.

## Running it

```bash
cd tools/oidc-repro
./scripts/up.sh
```

That takes a few minutes on a cold cache, mostly the image build. When it
finishes it prints the Headlamp URL, the Dex issuer, and the test credentials.

**Verify the stack before trusting any repro:** open the printed Headlamp URL
in a private window and sign in as `alice@example.com` / `password`. If that
login does not complete, fix the stack first — a broken stack produces failures
that look exactly like the bugs being investigated.

Tear down with `./scripts/down.sh`, which deletes the cluster, the harness
kubeconfig, and the locally built image.

### The harness has its own kubeconfig

Every script exports `KUBECONFIG=tools/oidc-repro/.kubeconfig` and never reads
or writes `~/.kube/config`. Your current context is untouched, and the
cluster-admin binding this harness creates cannot land on another cluster.

To poke at the cluster yourself:

```bash
export KUBECONFIG=$PWD/.kubeconfig    # from tools/oidc-repro
kubectl get pods -A
```

## What `up.sh` builds

| Piece | Detail |
|---|---|
| kind cluster | `headlamp-oidc-repro`, single node. The apiserver's own OIDC flags are **not** set — see `kind-config.yaml` for why. |
| Dex | Two static users (`alice@example.com`, `bob@example.com`, both `password`) and a static client `headlamp-test`. NodePort 30556. |
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
comparable.

## The repro scripts

Each script explains its own hypothesis in its header, prints what it observed,
and appends a notes template. Run them from anywhere; paths resolve from the
script location, not the working directory.

### `repro-4019.sh` — [#4019](https://github.com/kubernetes-sigs/headlamp/issues/4019)

Automated. Drives the full authorization-code flow with curl: `GET /oidc`
through nginx, submits Dex's login form, then `GET /oidc-callback` through
nginx again. Reports which replica handled each request and what the callback
returned.

The hypothesis is that pending OAuth requests live in a process-local map keyed
by `state`, so a callback landing on the other replica fails with HTTP 400
`invalid request`. The script reports REPRODUCED only when the two requests
demonstrably hit different replicas.

### `repro-4877.sh` — [#4877](https://github.com/kubernetes-sigs/headlamp/issues/4877) / [#2134](https://github.com/kubernetes-sigs/headlamp/issues/2134)

Manual recipe. Prints three variants of "open a deep link, sign in, see where
you land": popup, direct navigation to the login route (which reaches
AuthChooser with no `location.state.from`), and full-page redirect with no
opener.
What is being observed is the URL bar, so this stays manual rather than pulling
in browser automation.

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

The anonymous grant and the probe pod are removed on exit, including when the
script fails partway.

### `repro-2126.sh` — [#2126](https://github.com/kubernetes-sigs/headlamp/issues/2126)

Manual recipe; needs an Electron build (`npm run start:with-app`). Walks through
signing in to a kubeconfig-OIDC cluster from the desktop app and records where
the session ends up.

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
