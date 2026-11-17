# e2e tests for the desktop (Electron) app

These are the Playwright tests for the desktop app, driven via
`npm run test-app`, which launches the real Electron app. The web-mode tests for
in-cluster Headlamp live in the top-level `e2e-tests` directory.

## Prerequisites

The cluster workflow specs need a running minikube cluster named `minikube`:

```bash
minikube start
kubectl config current-context   # should print: minikube
```

The name matters. `clusterRename.spec.ts` expects a cluster called `minikube`,
and `clusterAutoConnect.spec.ts` shells out to `minikube` directly to create and
delete its own throwaway profile, so `minikube` and `kubectl` must both be on
`PATH`. `listenerCleanup.spec.ts` does not require minikube.

`listenerCleanup.spec.ts` runs `gh --version`, so the GitHub CLI must also be
installed and available on `PATH`.

`kubeConfigImport.spec.ts` exercises multi-file import in the real Electron app
with the real backend and isolated profiles, including anonymous contexts and
persistence after reload. It uses synthetic kubeconfigs and does not require
minikube or access to a live cluster:

```bash
npm run app:test:e2e -- kubeConfigImport.spec.ts
```

Run this command from the repository root after completing the prerequisites below.

App mode runs the app from source rather than from a packaged build, so the
things the app loads in dev mode have to exist first:

```bash
# from the repository root
npm ci
npm run frontend:install
npm run app:install
npm run app:prepare      # -> frontend/build/index.html and .plugins/
npm run backend:build    # -> backend/headlamp-server
```

`backendToken.spec.ts` loads the bundled Plugin Catalog from
`.plugins/plugin-catalog`, which `app:prepare` downloads from the app build
manifest.

`app/build/main.js`, the Electron entry point, is built automatically by the
`pretest-app` script, so there is no separate step for it.

Then install the test dependencies:

```bash
cd app/e2e-tests
npm ci
```

## Running the tests

```bash
cd app/e2e-tests
npm run test-app
```

Or from the repository root:

```bash
npm run app:test:e2e
```

To build the frontend with the default production builder and verify that output
and multi-file kubeconfig imports in the real Electron app without requiring minikube:

```bash
npm run app:test:e2e:frontend-build
```

The Linux CI production-frontend runtime step runs this same command. It builds
the frontend and backend, then runs both `frontendBuild.spec.ts` and
`kubeConfigImport.spec.ts`, including anonymous imports and atomic rejection of
unresolved named users.

Optional flags can be passed from either directory:

```bash
# from app/e2e-tests
npm run test-app -- --headed   # watch it run
npm run test-app -- --ui       # Playwright UI mode

# from the repository root
npm run app:test:e2e -- --headed
npm run app:test:e2e -- --ui
```

## Combined unit and Electron E2E coverage

After installing the app and E2E dependencies above, run from the repository root:

```bash
npm run app:test:coverage
```

Playwright selectors and options are forwarded to the E2E phase. For example, this
cluster-independent smoke test exercises the real main process and sandboxed preload:

```bash
npm run app:test:coverage -- listenerCleanup.spec.ts
```

For the broader cluster-independent runtime scenarios, first build the backend,
then select the menu, registration, backend-readiness and plugin lifecycle tests:

```bash
npm run backend:build
npm run app:test:coverage -- \
  appMenuZoom.spec.ts buildManifest.spec.ts clusterRegistration.spec.ts \
  externalBackendToken.spec.ts listenerCleanup.spec.ts pluginManager.spec.ts
```

On Windows, use `make backend` (with Make installed) or
`go build -C backend -o headlamp-server.exe ./cmd` for the backend build above;
the internal-backend retry requires `backend/headlamp-server.exe`.

These workflows use temporary homes, profiles and kubeconfigs, fake external tools,
and synthetic plugin archives served over loopback. They do not need minikube or
access to a real cluster. The plugin lifecycle fixture captures native dialogs and
intercepts its synthetic Artifact Hub metadata request; IPC, archive downloads,
checksum verification, installation, updates and removal use the real implementation.

The command runs all Electron unit tests with Istanbul, builds instrumented Electron
bundles, runs the selected E2E specs, and merges their statement counters using source
maps. It does not average unit and E2E percentages. Unvisited source files remain in
the denominator.

Reports are written under `app/coverage/`:

- `unit/coverage-final.json`: the unit-test counters.
- `e2e/`: snapshots from each Electron main process and preload context.
- `e2e-status/`: per-process completion records; any failed or unfinished collector
  prevents a combined success report, even if earlier snapshots were saved.
- `combined/index.html`: the combined source report.
- `combined/coverage-summary.json`: machine-readable totals.

The scope is production TypeScript and JavaScript under `app/electron/`, excluding
tests and declaration files. It does not include the frontend renderer, backend,
`electron-builder.config.ts`, or build/packaging scripts. Standalone fixture bundles
compiled directly by a spec are not instrumented; select at least one spec that
launches the normal app. Missing main/preload snapshots or incompatible statement
maps fail the command rather than producing a misleading combined result.

Instrumentation and its private snapshot IPC channel are present only when
`compile-electron -- --coverage` is explicitly selected. The coverage runner supplies
an absolute `HEADLAMP_E2E_COVERAGE_DIR`; normal builds and E2E commands do not enable
collection. Main-process counters are saved on quit/exit and catchable POSIX
termination signals; preload counters are saved on unload, including reloads.
Signal collection requests normal Electron shutdown when no other signal handler
owns termination, preserving backend and settings cleanup. Crashed or forcibly
killed processes cannot guarantee a final snapshot.
The backend-readiness fixture requests graceful shutdown through Playwright before
using forced termination as a bounded fallback, including on Windows.
Snapshot errors are logged without blocking synchronous IPC or graceful shutdown,
and permanently mark that process's collection as failed.

The runner rebuilds ordinary development bundles after success, test failures, or
handled termination signals. If it is forcibly killed, rebuild explicitly before
reusing prepared build output:

```bash
npm --prefix app run compile-electron -- --dev
```

Signals received during restoration do not terminate the rebuild, but the command
still exits unsuccessfully once restoration finishes.

Do not package the instrumented output. This command measures the selected E2E
scenarios, not necessarily every desktop workflow; running a subset must not be
presented as coverage of the full E2E suite.

## Troubleshooting

**`electron.launch: Process failed to launch!`** The app takes a
single-instance lock, so only one instance can run at a time. Check for a
leftover Electron process from an earlier interrupted run.
