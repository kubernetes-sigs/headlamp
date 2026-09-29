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

App mode runs the app from source rather than from a packaged build, so the
things the app loads in dev mode have to exist first:

```bash
# from the repository root
npm run frontend:install
npm run frontend:build   # -> frontend/build/index.html
npm run backend:build    # -> backend/headlamp-server
npm run app:install
```

`app/build/main.js`, the Electron entry point, is built automatically by the
`pretest-app` script, so there is no separate step for it.

Then install the test dependencies:

```bash
cd app/e2e-tests
npm install
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

Optional flags can be passed from either directory:

```bash
# from app/e2e-tests
npm run test-app -- --headed   # watch it run
npm run test-app -- --ui       # Playwright UI mode

# from the repository root
npm run app:test:e2e -- --headed
npm run app:test:e2e -- --ui
```

## Troubleshooting

**`electron.launch: Process failed to launch!`** The app takes a
single-instance lock, so only one instance can run at a time. Check for a
leftover Electron process from an earlier interrupted run.
