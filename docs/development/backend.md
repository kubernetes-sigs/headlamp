---
title: Backend
sidebar_position: 1
---

Headlamp's backend is written in Go. It is in charge of redirecting
client requests to the right clusters and returning any available
plugins for the client to use.

The backend's most essential function is to read the cluster information
from the given configuration and set up proxies to the defined clusters as
well as endpoints to them. This means that instead of having a set of
endpoints related to the functionality available to the client, it simply
redirects the requests to the defined proxies.

## Building and running

The backend (Headlamp's server) can be quickly built using:

```bash
npm run backend:build
```

Once built, it can be run in development mode (insecure / don't use in production) using:

```bash
npm run backend:start
```

The development launcher forwards `SIGINT`, `SIGTERM`, `SIGHUP`, and `SIGBREAK`
to the backend, matching cross-env's signal handling.

### Compiler flags and debugging information

The npm and Makefile backend builds use a shared Go driver with no external
dependencies. Make backend builds do not require Node.js. The npm path uses a
small Node.js launcher, which does not add a requirement beyond npm itself.
The stdlib-only bootstrap ignores surrounding module requirements; the actual
backend build retains the caller's module and automatic toolchain settings.
With no linker overrides, both retain the existing `-trimpath`, `-s`, and `-w`
defaults.

`GOFLAGS` settings, including those saved with `go env -w`, are honored.
Use Go's `-ldflags` setting in `GOFLAGS` to replace the default stripping flags.
Makefile builds retain the application version and name, and embedded builds add
the required `embed` tag without discarding caller-supplied build tags.
Package-specific `-ldflags` settings keep Go's matching and precedence rules.

To retain symbol tables and DWARF debugging information:

```bash
GOFLAGS='-ldflags=' npm run backend:build
GOFLAGS='-ldflags=' make backend
```

For easier stepping through unoptimized code with local source paths, use Go's
quoting syntax for settings containing spaces:

```bash
GOFLAGS="-trimpath=false -ldflags= '-gcflags=all=-N -l'" make backend
```

These variables are inherited by desktop packaging hooks and embedded
cross-compilation targets. `CC`, `CXX`, `CGO_CFLAGS`, `CGO_CXXFLAGS`, and
`CGO_LDFLAGS` are passed through to Go unchanged when cgo is enabled; embedded
cross-compilation targets continue to disable cgo.
Generic C/C++ `CFLAGS` and `LDFLAGS` are not reinterpreted as Go options; use the
Go and cgo variables above.
The container build accepts `--build-arg GOFLAGS=...` and continues to use Go's
unstripped defaults unless stripping is explicitly requested.

CI exercises native Make/npm entrypoints on Linux, macOS, and Windows. Desktop
packaging and a backend-only container build request
`GOFLAGS='-trimpath=false -ldflags=-compressdwarf=false'`; the artifact verifier
then checks the recorded flags and uncompressed DWARF entries in the resulting
backend binaries, including packaged desktop resources.

## Backend token protection

`HEADLAMP_BACKEND_TOKEN` enables a local trust boundary around protected backend
routes. The desktop app generates a random token for each launch and sends it to
its backend and renderer. Development commands such as `npm run backend:start`
set a predictable token for local use.

When `HEADLAMP_BACKEND_TOKEN` is unset or empty, backend-token enforcement is
disabled. This opt-in behavior preserves standalone development and test setups
that start the backend directly. Do not expose a non-in-cluster server with an
empty token: protected cluster, plugin, Helm, and proxy routes are then available
without this additional credential check.

When the variable is non-empty, clients must send the same value in the
`X-HEADLAMP_BACKEND-TOKEN` header. WebSocket clients use Headlamp's private
backend-token subprotocol instead. In-cluster mode does not use this desktop
token boundary and continues to rely on its configured authentication and
authorization mechanisms.

## Multiplexed WebSocket ownership

Each `/wsMultiplexer` client socket owns its upstream subscriptions. Routing
`userId` values are not authenticated identities: a second socket using identical
cluster/path/user fields must establish its own upstream connection with its own
credentials. Its `CLOSE` messages and disconnect cannot stop another client's
subscription.

Watches (`watch=true` or `watch=1`) also include the exact original subscription
query in that ownership key. Different selectors or resource versions on the same
path are independent, and `CLOSE` targets only its own query. `STATUS`, data,
retry errors, and ACKs preserve the original query and userId even when an
upstream resume handshake uses a newer cursor. Explicit `reopen` replaces only
that exact watch subscription, never another query's connection.

An upstream connection retains the credential used for its handshake. Changing
credentials requires a new subscription/client connection; replacing a stored
token cannot reauthenticate an existing socket. Explicit unsafe service-account
mode still uses its configured service-account credential, with separate
subscriptions per client.

Finite stream completion closes the upstream socket and leaves the subscription
available to its client. Watches retain the main branch's exponential
backoff and resume from the last resource version successfully forwarded to the
client; expired watches ask the client to list again instead of resuming.
Routine upstream watch timeouts (close code 1000) and going-away closes (1001)
resume in the same way. An `ErrCloseSent` ping waits for the reader's close
classification; it does not stop the sole monitor. A pending explicit reopen
also leaves that monitor alive so a failed watch replacement can retry.
Non-watch streams, including exec and logs, never redial automatically after a
failed ping or reader exit. Only a new explicit `REQUEST` can reopen them.
`CLOSE` and client disconnect cancel a pending replacement.
Requests received during a replacement get a retry error. The multiplexer also
reports upstream write failures to the requesting client.

Opted-in list and single-object watch subscriptions recognize the
`subscription_reconnecting` error code. Open watch transports in the error state
return the same coded error during backoff even when no dial is currently reserved.
Once the pending replacement finishes, they explicitly send `REQUEST` with
`reopen: true` and their own query and original routing identity. This watch-only
operation checks the existing handshake credential before replacing the socket.
Both explicit replacements and heartbeat recovery resume from the last forwarded
resource version and seed the replacement's cursor, even before its first event.
Status and data keep the exact original query for routing. Multiplexed browser
watches share the opening cursor per cached query and pin it until a relist/refetch;
cache updates do not change their subscription identity. Legacy watches retain
their mutable cursors because that transport does not reconnect on its own.
After a single-object watch expires, a name-filtered collection LIST supplies a
fresh snapshot and collection cursor: a named GET can keep returning an expired
object version. This recovery requires LIST permission, and failures are surfaced
through the query error. All observers adopt the fresh cursor, including when the
fetching observer unmounts. Deleted objects report 404 while the watch remains
active to observe recreation.
The error's `retryReady` acknowledgement handles errors delivered after the
connected status or normal completion without retrying against a stale
pre-reconnect status. This retries only an outstanding rejected watch request.
Unsubscribed watches cancel the pending retry; generic and exec subscriptions do
not opt in.

Each client retains at most 64 unreserved completed subscriptions for explicit
reopening. Older completed entries are removed without affecting other clients
or reserved replacements. Retained entries still reject changed credentials;
an evicted route needs a fresh authenticated handshake. Retention indexes completed
entries per client and examines at most 65 entries when evicting, without scanning
active subscriptions or other clients. Successful replacements skip retention
entirely. Cleanup uses no additional timers or workers.

Client reads remain responsive while initial or replacement handshakes are
pending. `CLOSE` and disconnect invalidate the subscription and cancel the dial,
including a blocked HTTP upgrade; a canceled request cannot install a socket or
send its payload. Requests are processed by one bounded worker per client.
REQUEST queue exhaustion closes the client socket with a retry-later reason rather than
creating unbounded dial goroutines. Requests arriving during a pending dial are
not saved for automatic replay. CLOSE cancellation and transport cleanup are
immediate; their status notifications have a separate bounded queue, so they cannot
exhaust REQUEST capacity. Notifications are best effort and may be dropped when
that queue is full or the same route has already reopened.

Clients offer `headlamp.multiplexer.v2.k8s.io` before the original
`headlamp.multiplexer.k8s.io` protocol, alongside the existing private desktop
backend-token protocol when needed. The backend prefers v2 when offered and
continues to accept the original protocol or no selected protocol.
V2 advertises explicit ACK support. Independently of the selected protocol, the
backend honors every REQUEST carrying an optional `requestId` with a matching
`ACK` after the worker settles it, including a request canceled by `CLOSE`.
Parsed REQUESTs with missing routing fields receive ERROR followed by ACK without
executing upstream work.
This preserves older ACK-waiting clients that offer only the original protocol
or no protocol during rolling upgrades. ACK is flow-control credit, not an
upstream success result; requests without a `requestId` do not receive ACKs.
Only negotiated v2 enables browser request pacing and `requestId` fields. Legacy
connections send requests unpaced without request IDs or waiting for ACKs; STATUS,
ERROR, DATA, and COMPLETE are never processing credits. COMPLETE is a watch-batch
boundary, not subscription termination.
For v2, one per-socket 60-second missing-ACK deadline reports an explicit error
and closes the socket instead of silently abandoning the queue; this does not
create a timer per subscription. The browser sends at most one unacknowledged
list-watch request per socket and keeps at most one queued request per active watch,
so distinct-subscription bursts do not exhaust the backend's 32-slot queue.
Concurrent socket opens share one promise rather than per-subscriber polling timers.
If a legacy burst nevertheless closes the socket with code 1013, the browser
reconnects and restores only opted-in active list watches with the same queries
and fresh handshake credentials. Automatic overload recovery is capped at three
attempts without ACK progress; failures are surfaced to subscription listeners.
Generic/exec subscriptions are not automatically replayed by overload recovery.

Replacement reservations exclude upstream payload writes before the error status
is published. Status delivery never holds subscription lifecycle or global map
locks, so a stalled client cannot block other clients' lookups or cleanup.
Cleanup closes transports before sending statuses, and retiring transports are
detached before the replacement publishes its connected status.

A request queued during a heartbeat reservation gets an explicit retry even if
another client worker operation delays its processing until after installation.
A superseded watch reader retires its transport without closing the subscription,
so a failed replacement can retry with backoff from the last forwarded cursor.
Finite-stream completion, explicit close, disconnect, and watch expiry still
terminate their lifecycles as described above.

Protocol-level end-to-end tests use real client WebSockets, the production
multiplexer handler, and a local TLS upstream that rejects forged credentials:

```bash
cd backend
go test -race ./cmd -run 'Test(Multiplexer|Reconnect|MonitorConnection)' -count=20
```

These tests do not require a live Kubernetes cluster or enable multiplexing in
the frontend. Ordinary logs/terminal streams use their direct cluster endpoints.

## Service proxy content isolation

Service proxy responses set `Content-Security-Policy: sandbox` and
`X-Content-Type-Options: nosniff` to isolate service content from Headlamp's
origin. JSON and streaming are unchanged; interactive applications need a
separate origin.

## Persistent cluster deletion

`removeKubeConfig=true` requires `--allow-kubeconfig-changes` and a registered
file-backed cluster. The backend uses its loaded file and original context key,
not client-supplied identifiers; configured external files and symlinks work.
Runtime imports and renames retain this origin.
Imports and deletions lock the same recorded path, including symlinks.
File updates precede in-memory removal, so failures keep the stored cluster.
Memory-only deletion does not require file-mutation permission.

## JSON request body limits

Cluster add and rename, node drain, token-setting, and kubeconfig-parsing
endpoints accept one JSON value with a maximum body size of 1 MiB, including
trailing whitespace. Larger bodies return `413 Request Entity Too Large`;
malformed JSON or additional JSON values return `400 Bad Request`.
Unknown fields remain accepted for compatibility.

The limit is local to these endpoints, not global middleware. Kubernetes
API proxy requests are unchanged and can still forward larger manifests.

## Node drain authentication

The frontend submits node drains and polls their status through
`/clusters/<cluster>/drain-node` and `/clusters/<cluster>/drain-node-status`.
These paths receive the existing cluster-scoped authentication cookie and OIDC
refresh middleware; the current drain uses the refreshed user credential.
Kubernetes RBAC and audit events therefore use the caller's identity.

In-cluster requests without a user credential are rejected unless the existing
unsafe service-account mode was explicitly enabled. Drain does not implicitly
fall back to the pod's service account or forward that credential to an external
context. Legacy unscoped routes remain available for existing callers, but
cookie-only browser clients should use the cluster-scoped routes.

## Helm release history

`GET /clusters/<cluster>/helm/release/history` requires non-empty `name` and
`namespace` query parameters. Missing or empty values return `400 Bad Request`
before Helm accesses the cluster. Valid requests retain the existing
`{"releases": [...]}` response and release-lookup error handling.

## Helm chart sources

Helm install (`POST /clusters/<cluster>/helm/release/install`) and
upgrade (`PUT /clusters/<cluster>/helm/releases/upgrade`) requests
accept only a `chart` of the form
`<repository>/<chart>`, where `<repository>` is a Helm repository
registered with the backend through the repository routes. Other values
are rejected with `400`: `http(s)` and `oci://` URLs, absolute and
relative paths, and references that also exist as a path on the
backend's filesystem. This only checks the `chart` value in the request,
so a client cannot pass a chart URL or a local path. It does not limit
which repository URLs can be registered, or the chart URLs listed in a
repository's index; those are not covered by this check. Clients that
installed charts from a direct URL must add the repository first and
install from it.

## Kubernetes response cache

With `--cache-enabled`, users share resource responses within the same cluster
connection. Each GET still checks the caller's permissions through a Kubernetes
SelfSubjectAccessReview. Keys distinguish API versions, resources, namespaces,
names, query parameters and the `Accept` representation. For example,
`/api/v1/namespaces/team/pods/shared` and
`/api/v1/namespaces/team/secrets/shared` never share an entry.

A shared metadata list/watch invalidates each resource scope. It uses the
connection's credentials when available, or a requesting user's token for a
connection without stored credentials. Tokens are not saved to the context
store. Until the watch is synchronized, and whenever it disconnects, requests go
directly to Kubernetes. Authorization-check errors also bypass the cache.
Watch events and writes invalidate both existing responses and pending fills;
idle watches stop after ten minutes. Streaming, paginated, conditional, range,
impersonated and subresource requests bypass the response cache, as do requests
for a specific resource version or with `Cache-Control: no-cache`. Only successful
Kubernetes objects are stored, and never responses that set cookies, send
`Cache-Control: no-store` or vary on anything but `Accept` and `Accept-Encoding`.

## Telemetry

Headlamp's backend supports OpenTelemetry for distributed tracing and Prometheus metrics. See the [Telemetry guide](./telemetry.md) for configuration, local setup with Jaeger and Prometheus, and in-cluster deployment.

## Logging configuration

Headlamp’s backend supports configurable log levels to control verbosity.

Log level can be configured using either a flag or an environment variable:

- the log level: `--log-level` or env var `HEADLAMP_CONFIG_LOG_LEVEL`

Supported Values:

- `debug`
- `info` (default)
- `warn`
- `error`

> **Note:** Headlamp uses zerolog defaults.  
> Zerolog’s default log level is `info`, and Headlamp follows this behavior.

### Examples

Run with warning level:

```bash
./headlamp-server --log-level warn
```

## Lint

To lint the backend/ code.

```bash
npm run backend:lint
```

This command can fix some lint issues.

```bash
npm run backend:lint:fix
```

## Format

To format the backend code.

```bash
npm run backend:format
```

## Test

```bash
npm run backend:test
```

The development launcher's signal forwarding is tested by the app unit tests
(`app/electron/run-backend.test.ts`):

```bash
npm run app:test:unit
```

Test coverage with a html report in the browser.

```bash
npm run backend:coverage:html
```

To just print a simpler coverage report to the console.

```bash
npm run backend:coverage
```

## Memory profiling

Use representative kubeconfigs, clusters, and requests when comparing profiles. Run each
measurement several times and compare medians.

```bash
# GC activity and heap goals for a running development server.
GODEBUG=gctrace=1 npm run backend:start 2>gc.log

# Heap retained by a test or benchmark.
cd backend
go test -run TestName -memprofile=/tmp/heap.pprof ./pkg/package
go tool pprof -inuse_space /tmp/heap.pprof

# Total allocations, including objects that have already been collected.
go test -run '^$' -bench BenchmarkName -benchmem \
  -memprofile=/tmp/allocs.pprof ./pkg/package
go tool pprof -alloc_space /tmp/allocs.pprof

# Allocation/free events, GC pauses, and goroutine scheduling.
GODEBUG=traceallocfree=1 go test -run TestName -trace=/tmp/trace.out ./pkg/package
go tool trace /tmp/trace.out
```

On Unix, `GOTRACEBACK=all` followed by `kill -QUIT <pid>` prints all goroutine
stacks. This terminates the process, so only use it on a development instance.
Repeated dumps reveal goroutines whose count or blocked stacks keep growing.

In `pprof`, start with `top`, `top -cum`, `list <function>`, and `web`.
`inuse_space` identifies long-lived allocations; `alloc_space` identifies allocation
churn. Compare profiles with `go tool pprof -base before.pprof after.pprof`.
In traces and GC logs, look for a growing live heap after GC, frequent collections
with little heap reduction, and increasing goroutine counts. Map growth appears as
retained `runtime.mapassign` call paths and should be checked for missing bounds or
expiration.

### Ranked optimization opportunities

| Rank | Change | Expected memory effect | Trade-off |
| --- | --- | --- | --- |
| 1 | Share cache-invalidation watchers for equivalent cluster connections | Avoids duplicated informer stores and goroutines for stateless users | Requires careful authentication and watcher lifecycle isolation |
| 2 | Add byte and entry limits to the Kubernetes response cache | Prevents unbounded retained response growth and avoids caching oversized responses | Lower cache hit rate |
| 3 | Cache only the Kubernetes authorization client instead of a full clientset | Removes unused typed clients from each token cache entry | Narrows the internal cache API |
| 4 | Initialize proxy transports only when a context is first used | Saves per-context TLS and transport state for unused contexts | Adds synchronization to the first request |
| 5 | Lower `GOGC` for the desktop backend | About 2–4.5 MiB in measured idle/request workloads | More frequent GC and modestly higher CPU use |

The desktop launcher defaults its bundled backend to `GOGC=25`, while preserving
an explicitly configured `GOGC`. In isolated measurements, `GOGC=50` reduced
median startup RSS from 82,384 KiB to 80,492 KiB. Lowering it to `GOGC=25`
saved another 2.1 MiB of private dirty memory after 20,000 `/config` requests,
with about 11% more backend CPU than `GOGC=50`.

`GOMEMLIMIT` is a soft runtime limit rather than a live-heap target. Set it to
roughly 85–90% of a container's memory limit, leaving room for the executable,
stacks, and non-Go allocations. Limits between 20 MiB and 64 MiB did not
consistently reduce the small desktop startup workload, so the app does not force
a fixed value. Re-profile under production load before setting either variable.

### Evaluated compiler and runtime options

The following medians are from three Linux amd64 runs of 20,000 local `/config`
requests with Go 1.26.5. Private dirty memory is reported instead of total RSS
because demand-paged executable mappings varied substantially with link layout.
These are directional results from a small workload.

| Runtime configuration | Private dirty after requests | Backend CPU | Result |
| --- | ---: | ---: | --- |
| `GOGC=100` | 17.2 MiB | 3.26 s | Go default and comparison baseline |
| `GOGC=50` | 14.8 MiB | 3.37 s | Saves 2.4 MiB over the Go default |
| `GOGC=25` | 12.7 MiB | 3.73 s | Current desktop default; saves another 2.1 MiB with about 11% more CPU than `GOGC=50` |
| `GOGC=50 GOMEMLIMIT=64MiB` | 14.8 MiB | 3.43 s | No measurable saving in this workload |
| `GOGC=50 GODEBUG=disablethp=1` | 11.7 MiB | 3.44 s | Linux-only saving on this host; not used because the compatibility setting is scheduled for removal |
| `GOGC=50 GOMAXPROCS=1` | 13.2 MiB | 2.32 s | Not used because serializing execution can hurt concurrent workloads |

Compiler experiments used the same workload with `GOGC=50`:

| Build option | Binary size | Private dirty | Backend CPU | Result |
| --- | ---: | ---: | ---: | --- |
| Default | 114.4 MiB | 14.8 MiB | 3.37 s | Baseline |
| `-trimpath -ldflags="-s -w"` | 81.4 MiB | 14.5 MiB | 3.38 s | Current backend build default; saves 28.8% on disk, but no meaningful runtime memory |
| `-gcflags=all=-l` | 103.5 MiB | 12.8 MiB | 4.21 s | About 2 MiB less memory at roughly 25% more CPU; not selected |
| `GOAMD64=v3` | 114.4 MiB | 14.9 MiB | 3.41 s | No memory saving and reduces CPU compatibility |
| `-buildmode=pie` | 120.9 MiB | 19.1 MiB | 3.45 s | Increased private memory |
| `GOEXPERIMENT=greenteagc` | 114.4 MiB | 14.7 MiB | 3.47 s | No meaningful saving in this workload |

Go plugins are not a portable memory-saving mechanism for the backend. They are
unsupported on Windows, must match the main binary's toolchain and dependencies,
cannot be unloaded, and therefore retain their memory after first use. Splitting
optional features into helper processes would also add another Go runtime and IPC
complexity.

## Fuzz Testing

Some backend functions include fuzz tests using Go's native fuzzing support. For example, the `SanitizeClusterName` function in `backend/pkg/auth` has a fuzz test.

To run fuzz tests:

```bash
npm run backend:fuzz
```

This will run fuzz tests in the `backend/pkg/auth` package for 30 seconds. The fuzz corpus (interesting test cases discovered during fuzzing) is stored in `testdata/fuzz/` directories and committed to the repository for regression testing.

For more information about Go fuzzing, see the [official Go fuzzing documentation](https://go.dev/security/fuzz/).
