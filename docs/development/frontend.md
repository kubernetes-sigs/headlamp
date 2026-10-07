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

This command starts the Vite development server for the frontend
(by default at `localhost:3000`).

We use [react-query](https://tanstack.com/query/latest/docs/framework/react/overview)
for network requests. If you need the devtools for react-query, you can simply set `REACT_APP_ENABLE_REACT_QUERY_DEVTOOLS=true` in the `.env` file.

Packaged products can generate the frontend version, product name, and source
revision from app build inputs. See [Custom product builds](./app.md#custom-product-builds)
for the `HEADLAMP_BUILD_MANIFEST` and `HEADLAMP_SOURCE_COMMIT` configuration.

## Product error content

Products that build Headlamp can customize the generic error and not-found
pages with these build-time environment variables:

| Environment variable                        | Default                           | Description                                           |
| ------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `REACT_APP_HEADLAMP_ERROR_PAGE_TITLE`       | `Uh-oh! Something went wrong.`    | Title for the generic error page.                     |
| `REACT_APP_HEADLAMP_ERROR_PAGE_GRAPHIC`     | Headlamp broken illustration      | URL or public path of the generic error page graphic. |
| `REACT_APP_HEADLAMP_NOT_FOUND_PAGE_TITLE`   | `Whoops! This page doesn't exist` | Title for the not-found page.                         |
| `REACT_APP_HEADLAMP_NOT_FOUND_PAGE_GRAPHIC` | Headlamp 404 illustration         | URL or public path of the not-found page graphic.     |

Set the variables in `frontend/.env` or in the environment used to start or
build the frontend. Restart the development server or rebuild the frontend
after changing them. Product-provided titles are not translated by Headlamp;
products are responsible for localizing their text and graphics.

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

## API documentation

API documentation for TypeScript is done with [typedoc](https://typedoc.org/) and [typedoc-plugin-markdown](https://github.com/tgreyuk/typedoc-plugin-markdown), and is configured in tsconfig.json.

```bash
npm run docs
```

The API output markdown is generated in `docs/development/api/`, committed to
Git, and shown on the website at
[headlamp/latest/development/api](https://headlamp.dev/docs/latest/development/api/).
When API changes affect the generated output, run `npm run docs` and include
the resulting `docs/development/api/` updates in the same change for review.

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

### Storybook accessibility testing

Accessibility testing can be performed on all Storybook stories using axe-storybook-testing.
This runs automated accessibility checks against all components in the Storybook.

To run the accessibility tests:

```bash
npm run frontend:test:a11y
```

Or from within the frontend directory:

```bash
npm run test:a11y
```

This command will:

1. Build the Storybook
2. Run axe accessibility tests on all stories
3. Report any accessibility violations found

The tests will fail if any accessibility issues are detected, making it useful for CI/CD pipelines.

#### Baseline Storybook a11y Configuration

Known failures are tracked in `frontend/.axe-storybook-baseline.test-a11y.json`. This file is
used by the test suite to allow known failures while catching new violations.

## Property testing (fuzzing)

We are using [fast-check](https://fast-check.dev/) for property testing.
This is especially useful for parsers, validators, race conditions and such.
