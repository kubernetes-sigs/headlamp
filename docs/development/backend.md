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
| 1 | Store only object metadata in cache-invalidation informers | 70–99% of informer object heap, depending on resource payload size | Informer handlers cannot later consume spec or status without removing the transform |
| 2 | Share cache-invalidation watchers for equivalent cluster connections | Avoids duplicated informer stores and goroutines for stateless users | Requires careful authentication and watcher lifecycle isolation |
| 3 | Add byte and entry limits to the Kubernetes response cache | Prevents unbounded retained response growth and avoids caching oversized responses | Lower cache hit rate |
| 4 | Cache only the Kubernetes authorization client instead of a full clientset | Removes unused typed clients from each token cache entry | Narrows the internal cache API |
| 5 | Initialize proxy transports only when a context is first used | Saves per-context TLS and transport state for unused contexts | Adds synchronization to the first request |
| 6 | Lower `GOGC` for the desktop backend | About 2–4.5 MiB in measured idle/request workloads | More frequent GC and modestly higher CPU use |

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
