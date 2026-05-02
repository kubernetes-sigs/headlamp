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

The frontend can be quickly built using:

```bash
npm run frontend:build
```

Once built, it can be run in development mode (auto-refresh) using:

```bash
npm run frontend:start
```

This command leverages the `create-react-app`'s start script that launches
a development server for the frontend (by default at `localhost:3000`).

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

## Linting

The frontend has two lint modes that share the same ESLint base config but
differ in which rules are enforced and how strictly warnings are treated.

The slow React Compiler `react-hooks/*` rules are checked in three places:
the husky **pre-commit hook**, the **VSCode** editor, and **CI** — but
**not** in `npm run lint`. The pre-commit hook and VSCode each operate on
a small set of files at a time so the cost is negligible there, whereas
`npm run lint` runs over the whole tree and needs to stay fast.

### `npm run lint` (local development)

The fast, permissive mode you run while editing:

```bash
cd frontend && npm run lint        # check
cd frontend && npm run lint -- --fix   # auto-fix what it can
```

Or from the repo root: `npm run frontend:lint` / `npm run frontend:lint:fix`.

It uses the ESLint config in `frontend/package.json` (`eslintConfig`).
Only `react-hooks/rules-of-hooks` is enabled (as `warn`); the rest of the
slow `react-hooks/*` rules are off here.

### `npm run lint:slow` (CI / pre-commit / strict)

Run this before opening a PR, or rely on it via `husky` pre-commit and CI:

```bash
cd frontend && npm run lint:slow

# auto-fix what ESLint can fix, then run prettier:
cd frontend && npm run lint:slow:fix
```

From the repository root:

```bash
npm run frontend:lint:slow
npm run frontend:lint:slow:fix
```

`lint:slow` is the strict mode used by:

- the GitHub Actions workflow `.github/workflows/frontend.yml`
- the `make frontend-lint` target
- the `husky` pre-commit hook through `lint-staged`
- developers verifying their work locally before pushing

It differs from `npm run lint` in two ways:

1. It points ESLint at a dedicated config, `frontend/.eslintrc.slow.cjs`, which
   `extends` the base config from `package.json` and re-enables every
   `react-hooks/*` rule as `warn`.
2. It passes `--max-warnings 0`, which makes any warning a hard failure.

### React Hooks rules enforced in CI

`eslint-plugin-react-hooks` v7+ rules enabled in `lint:slow`:
`rules-of-hooks`, `exhaustive-deps`, `component-hook-factories`, `globals`,
`immutability`, `purity`, `refs`, `set-state-in-effect`,
`set-state-in-render`, `static-components`, `unsupported-syntax`,
`use-memo`. See the
[plugin docs](https://react.dev/reference/eslint-plugin-react-hooks)
for what each one catches.

### Why the React Compiler rules are kept out of `npm run lint`

The `react-hooks/*` rules from `eslint-plugin-react-hooks` v7+ are powered
by the React Compiler. They are excellent at catching real bugs, but they
are also **roughly 5× slower** than the rest of the lint pass. Turning
them on for `npm run lint` would push it from ~1 second to ~15 seconds on
a typical workstation, and to multiple minutes on lower-specced hardware
(see below).

That trade-off matters because `npm run lint` is the **fast path** —
the "quick check" developers run constantly while editing, switching
branches, or rewriting commits. Several common workflows defeat the
ESLint cache (e.g. `git rebase -i`, switching to a fresh worktree, CI
without a cache hit), so the uncached time is what actually gets
experienced. A 1-second lint stays in the flow of work; a 15-second
lint does not, and developers start skipping it. It is even more true
on common Windows lower-specced machines where it can instead take
2.5 minutes to run lint with the React Compiler enabled! Consider that
people might run that for bisecting 20 commits… and it adds up.

So Headlamp follows a deliberate pattern that already shows up elsewhere
in the codebase: **slower checks live on a separate, slower path, while
the fast path stays fast.** Concretely:

- `npm run tsc` — full TypeScript typechecking is **not** run as part of
  `npm run lint`; it has its own command and runs in CI.
- `npm run format-check` — Prettier formatting is **not** run as part of
  `npm run lint`; it has its own command and is part of `lint:slow`.
- Frontend integration / e2e tests (`npm run app:test:e2e`, Storybook
  smoke tests, etc.) are **not** part of `npm run frontend:test`; they
  run on their own slower jobs.
- Backend integration tests are **not** part of the default `go test`
  pass; they sit behind their own targets in the `Makefile`.

The `react-hooks/*` rules slot into the same pattern. The fast path
(`npm run lint`) keeps only `react-hooks/rules-of-hooks` — the rule that
catches the most fundamental hook misuse — so trivial mistakes still
surface immediately. Everything else is enforced in the slower
`lint:slow` path that runs in CI, on the husky pre-commit hook (via
`lint-staged`, which only lints changed files so it stays fast), and
when a developer explicitly opts in by running `npm run frontend:lint:slow`
before pushing.

In other words: nothing is being skipped — every check still runs before
code lands. The split is purely about which checks belong on the
sub-second feedback loop and which belong on the multi-minute one.

### Where each piece lives

- `frontend/package.json` — `lint`, `lint:slow`, `lint:slow:fix`, `format`,
  `format-check` scripts and the base `eslintConfig`.
- `frontend/.eslintrc.slow.cjs` — strict CI config that re-enables the
  `react-hooks/*` rules.
- `frontend/.eslintignore` — paths excluded from linting (notably the
  gitignored copies of `frontend/src/` that `plugins/headlamp-plugin/`
  scripts create locally).
- Root `package.json` — `frontend:lint`, `frontend:lint:slow`,
  `frontend:lint:slow:fix`, `frontend:lint:fix` passthrough scripts.
- `Makefile` — `frontend-lint` target (`npm run lint:slow && npm run format-check`).
- `.github/workflows/frontend.yml` — runs `npm run frontend:lint:slow` on every push and pull request.
- `.vscode/settings.json` — points VS Code's ESLint extension at `.eslintrc.slow.cjs`.
- `.zed/settings.json` — points Zed's ESLint LSP at `.eslintrc.slow.cjs`.
- `.neoconf.json` — points Neovim's `eslint` LSP (via `neoconf.nvim`) at `.eslintrc.slow.cjs`.
- **JetBrains (WebStorm / IntelliJ)** — `.idea/` is gitignored so no committed
  config is possible. Configure manually: *Settings → Languages & Frameworks →
  JavaScript → Code Quality Tools → ESLint → Manual ESLint configuration →
  Configuration file: `frontend/.eslintrc.slow.cjs`*.

## Property testing (fuzzing)

We are using [fast-check](https://fast-check.dev/) for property testing.
This is especially useful for parsers, validators, race conditions and such.
