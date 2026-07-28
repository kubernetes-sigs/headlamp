# e2e tests for the desktop (Electron) app

These are the Playwright tests for the desktop app. The web-mode tests for
in-cluster Headlamp live in the top-level `e2e-tests` directory.

There are two modes:

- **app mode** (`npm run test-app`) drives the Electron app directly. This is
  the mode most of these tests are written for; three of the four skip unless
  `PLAYWRIGHT_TEST_MODE=app`.
- **web mode** (`npm run test-web`) drives a browser against a separately
  running backend and frontend.

## Prerequisites

Both modes need a running minikube cluster named `minikube`:

```bash
minikube start
kubectl config current-context   # should print: minikube
```

The name matters. `clusterRename.spec.ts` expects a cluster called `minikube`,
and `clusterAutoConnect.spec.ts` shells out to `minikube` directly to create and
delete its own throwaway profile, so `minikube` and `kubectl` must both be on
`PATH`.

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
npx playwright install chromium
```

Chromium is required even though these are Electron tests. The specs request
Playwright's `page` fixture before switching to the Electron window, and
requesting it launches a browser.

## Running the tests

### App mode

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

### Web mode

Web mode needs the backend and frontend running in separate terminals first:

```bash
# terminal 1, from the repository root
npm run backend:build && npm run backend:start

# terminal 2, from the repository root
npm run frontend:build && npm run frontend:start

# terminal 3
cd app/e2e-tests
npm run test-web
```

## Troubleshooting

**`electron.launch: Process failed to launch!`** The app takes a
single-instance lock, so only one instance can run at a time. Check for a
leftover Electron process from an earlier interrupted run.

**Switching between app and web mode.** If a run misbehaves after switching
modes, look for a leftover `headlamp-server` process from the previous mode and
stop it before trying again.
