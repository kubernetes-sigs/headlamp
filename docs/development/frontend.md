---
title: Frontend
sidebar_position: 2
---

The frontend is written in Typescript and React, as well as a few other important modules like:

- Material UI
- React Router
- Redux
- Redux Sagas

## Building and running

First, install the required dependencies by running:

```bash
npm run frontend:install
```

The frontend can be quickly built using:

```bash
npm run frontend:build
```

Once built, it can be run in development mode (auto-refresh) using:

```bash
npm run frontend:start
```

This command leverages **Vite** to launch the development server for the frontend (by default at `localhost:3000`).

> [!NOTE]
> Headlamp has migrated to **Vite** as its default bundler and development server, and also supports **Rsbuild** as an alternative dev server and bundler option. This can be run intentionally via `cd frontend && npm run star` (where `star` is a frontend-local script name, not a typo for `start`).

We use [react-query](https://tanstack.com/query/latest/docs/framework/react/overview) 
for network request, if you need the devtools for react-query, you can simply set `REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS=true` in the `.env` file.

## Linting

For local development, run:

```bash
npm run frontend:lint
```

This runs ESLint with the expensive compiler-based `react-hooks/*` rules turned off so it stays fast.

CI uses a stricter check that re-enables all `react-hooks/*` rules and treats every warning as an error (`--max-warnings 0`):

```bash
cd frontend && npm run ci-lint
```

You can run `ci-lint` locally before pushing to catch any react-hooks violations that CI would flag.

## Testing

For running the frontend unit and component tests, Headlamp uses **Vitest**:

```bash
npm run frontend:test
```

This runs Vitest and reports the test coverage. You can append options as needed (e.g., `-- --run` to run once without watch mode).

## API documentation

API documentation for TypeScript is done with [typedoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://github.com/tgreyuk/typedoc-plugin-markdown), and is configured in tsconfig.json

```bash
npm run docs
```

The API output markdown is generated in docs/development/api and is not
committed to Git, but is shown on the website at
[headlamp/latest/development/api](https://headlamp.dev/docs/latest/development/api/)

## Storybook

Components can be discovered, developed, and tested inside the 'storybook'.

From within the [Headlamp](https://github.com/kubernetes-sigs/headlamp/) repo run:

```bash
npm run frontend:storybook
```

If you are adding new stories, please wrap your story components with the `TestContext` helper
component. This sets up the store, memory router, and other utilities that may be needed for
current or future stories:

```jsx
<TestContext>
  <YourComponentTheStoryIsAbout />
</TestContext>
```

## Accessibility (a11y)

### Developer console warnings and errors

axe-core is used to detect some a11y issues at runtime when running
Headlamp in developer mode. This detects more issues than testing
components via eslint or via unit tests.

Any issues found are reported in the developer console.

To enable the alert message during development, use the following:

```bash
REACT_APP_SKIP_A11Y=false npm run frontend:start
```

This shows an alert when an a11y issue is detected.

## Property testing (fuzzing)

We are using [fast-check](https://fast-check.dev/) for property testing.
This is especially useful for parsers, validators, race conditions and such.
