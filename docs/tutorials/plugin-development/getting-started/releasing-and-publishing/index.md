---
title: "Tutorial 11: Releasing & Publishing Your Plugin"
sidebar_label: "11. Releasing & Publishing"
sidebar_position: 12
---

# Releasing & Publishing Your Plugin

In [Tutorial 10](../adding-custom-map-nodes/) we added custom map nodes to Headlamp's Map view. You now have a fully-featured `hello-headlamp` plugin with a sidebar, pages, Kubernetes data integration, list and detail views, settings, a custom theme, and map nodes.

This tutorial covers the final step of the plugin lifecycle: **getting your plugin ready for release and making it discoverable** by other Headlamp users via [Artifact Hub](https://artifacthub.io).

---

## Table of Contents

1. [Release Readiness Checklist](#release-readiness-checklist)
2. [Your Plugin's Built-in npm Scripts](#your-plugins-built-in-npm-scripts)
3. [Formatting Your Code](#formatting-your-code)
4. [Linting Your Code](#linting-your-code)
5. [Type-Checking Your Code](#type-checking-your-code)
6. [Running Tests](#running-tests)
7. [Setting Your Version](#setting-your-version)
8. [Building for Production](#building-for-production)
9. [Packaging the Plugin](#packaging-the-plugin)
10. [Creating a GitHub Release](#creating-a-github-release)
11. [How Headlamp Uses Artifact Hub](#how-headlamp-uses-artifact-hub)
12. [Adding the Artifact Hub Repository File](#adding-the-artifact-hub-repository-file)
13. [Adding the Artifact Hub Package File](#adding-the-artifact-hub-package-file)
14. [Pushing to GitHub](#pushing-to-github)
15. [Registering on Artifact Hub](#registering-on-artifact-hub)
16. [Releasing Updates](#releasing-updates)
17. [What's Next](#whats-next)
18. [Quick Reference](#quick-reference)

---

## Release Readiness Checklist

Before packaging and publishing, make sure your plugin passes each of the following checks. Going through these in order catches the most common issues first.

| # | Check | Command | Why it matters |
|---|-------|---------|----------------|
| 1 | Code is formatted consistently | `npm run format` | Consistent style; required by ESLint |
| 2 | No linting errors | `npm run lint` | Catches bugs and code-quality issues |
| 3 | TypeScript compiles without errors | `npm run tsc` | Catches type errors before they reach users |
| 4 | All tests pass | `npm run test` | Confirms no regressions |
| 5 | Version number is correct | edit `package.json` | Determines the filename of the tarball |
| 6 | Build succeeds | `npm run build` | Creates the production `dist/main.js` |
| 7 | Package succeeds | `npm run package` | Creates the `.tar.gz` ready for upload |

We will walk through each check in the sections below.

---

## Your Plugin's Built-in npm Scripts

When you created `hello-headlamp` with `npx @kinvolk/headlamp-plugin create hello-headlamp`, the template generated a `package.json` with a set of scripts that wrap the `headlamp-plugin` CLI:

```json
{
  "scripts": {
    "start":          "headlamp-plugin start",
    "build":          "headlamp-plugin build",
    "format":         "headlamp-plugin format",
    "lint":           "headlamp-plugin lint",
    "lint-fix":       "headlamp-plugin lint --fix",
    "package":        "headlamp-plugin package",
    "tsc":            "headlamp-plugin tsc",
    "storybook":      "headlamp-plugin storybook",
    "storybook-build":"headlamp-plugin storybook-build",
    "test":           "headlamp-plugin test",
    "i18n":           "headlamp-plugin i18n"
  }
}
```

Here is what each script does:

| Script | What it does |
|--------|-------------|
| `start` | Watches `src/` for changes and rebuilds automatically — used during development |
| `build` | Compiles TypeScript and bundles everything into `dist/main.js` — used for production |
| `format` | Runs [Prettier](https://prettier.io/) to auto-format all source files |
| `lint` | Runs [ESLint](https://eslint.org/) and reports any code-quality issues |
| `lint-fix` | Runs ESLint and automatically fixes everything it can |
| `package` | Bundles `dist/` into a `.tar.gz` tarball in the Headlamp-accepted format |
| `tsc` | Runs the TypeScript compiler in check-only mode to find type errors |
| `storybook` | Starts a Storybook development server for building component stories |
| `storybook-build` | Builds a static Storybook site |
| `test` | Runs unit tests with Jest |
| `i18n` | Extracts translatable strings for internationalisation |

The four scripts you will run every time before a release are: **`format`**, **`lint`**, **`tsc`**, and **`test`** — followed by **`build`** and **`package`**.

---

## Formatting Your Code

Headlamp plugins use [Prettier](https://prettier.io/) for code formatting, configured via the `@headlamp-k8s/eslint-config` shared config. Running the formatter first prevents the linter from reporting style-only errors.

```bash
cd hello-headlamp
npm run format
```

Expected output when everything is clean:

```
hello-headlamp/src/index.tsx 52ms
```

Prettier lists each file it processes. If a file needed changes, Prettier rewrites it in place — you will see a slightly longer time on the first run.

:::tip
Commit your code before formatting so you can clearly see what the formatter changed with `git diff`.
:::

---

## Linting Your Code

Linting runs [ESLint](https://eslint.org/) across your source files and checks for:

- Unused variables and imports
- Missing React key props in lists
- Accessibility issues (`jsx-a11y` plugin)
- TypeScript-specific code-quality rules
- Any patterns disallowed by Headlamp's shared ESLint config

```bash
npm run lint
```

If the linter finds fixable issues, you can automatically correct them with:

```bash
npm run lint-fix
```

A clean run looks like this:

```

> hello-headlamp@0.1.0 lint
> headlamp-plugin lint

```

Any reported problems include the file path, line number, and a description of the rule that was violated:

```
src/index.tsx
  42:7  error  'unusedVar' is defined but never used  @typescript-eslint/no-unused-vars

✖ 1 problem (1 error, 0 warnings)
```

Fix all errors before proceeding — the build step will still succeed with lint errors present, but shipping known issues to users is bad practice.

---

## Type-Checking Your Code

The `tsc` script runs the TypeScript compiler in `--noEmit` mode: it type-checks every file but does not output any JavaScript. This catches type mismatches that ESLint cannot see.

```bash
npm run tsc
```

A clean run produces no output and exits with code `0`. Any errors are shown with their file, line, and a clear description:

```
src/index.tsx:78:24 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```

Fix all TypeScript errors before continuing. Type errors are the most common cause of runtime crashes in plugins.

---

## Running Tests

If you have written unit tests (or plan to), run them now:

```bash
npm run test
```

This runs Jest, discovers all `*.test.ts(x)` and `*.spec.ts(x)` files in `src/`, and reports the results:

```
PASS  src/components/MyPage.test.tsx
  MyPage
    ✓ renders without crashing (23 ms)
    ✓ displays cluster name (18 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

All tests must pass before you proceed.

---

## Setting Your Version

Plugin versions follow **Semantic Versioning** (`MAJOR.MINOR.PATCH`):

| Segment | When to increment | Example |
|---------|-------------------|---------|
| `MAJOR` | Breaking change — removes or changes existing behaviour | `1.0.0 → 2.0.0` |
| `MINOR` | New feature added in a backward-compatible way | `1.0.0 → 1.1.0` |
| `PATCH` | Bug fix, with no new features or breaking changes | `1.0.0 → 1.0.1` |

For a first public release, `1.0.0` is the conventional starting point. The template starts at `0.1.0` — that version signals "not yet stable" and is fine for early development.

Open `package.json` and update the `version` field:

```json
{
  "name": "hello-headlamp",
  "version": "1.0.0",
  "description": "A Headlamp plugin tutorial series — sidebar, data, settings, themes, and map nodes.",
  ...
}
```

The version you set here determines the name of the tarball produced by `npm run package` (`hello-headlamp-1.0.0.tar.gz`) and must match the version you put in `artifacthub-pkg.yml` later.

---

## Building for Production

The `build` command compiles your TypeScript source and bundles it into `dist/main.js` — the single JavaScript file that Headlamp loads:

```bash
npm run build
```

You will see Vite output similar to this:

```
> hello-headlamp@1.0.0 build
> headlamp-plugin build

Building "." for production with plugin name: hello-headlamp...
Injecting env var: NODE_ENV = "production"
vite v6.4.1 building for production...
🎯 Plugin name detected: 'hello-headlamp'
✓ 4 modules transformed.
dist/main.js  11.90 kB │ gzip: 4.23 kB
✓ built in 135ms
Successfully copied extra dist files
Finished building "." for production.
```

The key file produced is `dist/main.js`. This is what Headlamp actually loads at runtime.

:::note
`npm run start` (the development watcher) also writes to `dist/main.js`, but that build is not minified or optimised. Always use `npm run build` for releases.
:::

---

## Packaging the Plugin

The `package` command takes the `dist/` directory and creates a `.tar.gz` tarball in the specific format Headlamp expects for installation:

```bash
npm run package
```

The output tells you exactly what was created and — crucially — the **SHA256 checksum** you will need for Artifact Hub:

```
Created tarball: "hello-headlamp-1.0.0.tar.gz"
Tarball checksum (SHA256): a3b4c5d6e7f8...
```

:::important
**Save the checksum.** You will need it in `artifacthub-pkg.yml`. If you lose it you can recompute it with `sha256sum hello-headlamp-1.0.0.tar.gz` on Linux/macOS or `Get-FileHash` on Windows.
:::

### What's inside the tarball?

The tarball always contains at minimum:

```
hello-headlamp/
├── main.js          ← compiled plugin bundle
└── package.json     ← plugin metadata (name, version, description)
```

If your plugin uses internationalisation, `npm run package` automatically includes the translations too:

```
hello-headlamp/
├── main.js
├── package.json
└── locales/         ← i18n translation files (only if a locales/ folder exists)
    ├── en/
    │   └── translation.json
    └── ...
```

You can also declare additional files to bundle via the `headlamp.extraDist` field in your `package.json`:

```json
{
  "headlamp": {
    "extraDist": {
      "assets/logo.png": "src/assets/logo.png"
    }
  }
}
```

This copies `src/assets/logo.png` into the tarball as `hello-headlamp/assets/logo.png`.

---

## Creating a GitHub Release

Headlamp only allows plugins to be downloaded from **GitHub, GitLab, or Bitbucket** for security reasons. A GitHub Release is the standard way to host the tarball so that Artifact Hub can reference it.

### Push your code

If you have not already pushed your plugin to GitHub, do so now:

```bash
# Inside hello-headlamp/
git init                            # if not already a git repo
git add .
git commit -m "chore: release v1.0.0"
git remote add origin https://github.com/YOUR_USERNAME/hello-headlamp.git
git push -u origin main
```

### Tag the release

Git tags are how GitHub identifies release versions. By convention, tags for semantic versions are prefixed with `v`:

```bash
git tag v1.0.0
git push origin v1.0.0
```

### Create the release on GitHub

1. Go to your repository on GitHub.
2. Click **Releases** → **Draft a new release**.
3. In "Choose a tag", select the `v1.0.0` tag you just pushed.
4. Set the release title to `v1.0.0`.
5. Add a description of what changed.
6. Under **Assets**, click **Attach binaries** and upload `hello-headlamp-1.0.0.tar.gz`.
7. Click **Publish release**.

After publishing, click on the `.tar.gz` asset and copy the download URL. It will look like:

```
https://github.com/YOUR_USERNAME/hello-headlamp/releases/download/v1.0.0/hello-headlamp-1.0.0.tar.gz
```

You will use this URL in the `artifacthub-pkg.yml` file below.

---

## How Headlamp Uses Artifact Hub

[Artifact Hub](https://artifacthub.io) is an open-source hub for cloud-native packages. Headlamp's **Plugin Catalog** (the built-in plugin manager in the Headlamp desktop app) reads plugin metadata directly from Artifact Hub to build its list of available plugins.

The flow looks like this:

```
Your GitHub repository
    │
    │  artifacthub-repo.yml   ← proves you own the repo
    │  artifacthub-pkg.yml    ← describes the plugin
    │
    ▼
Artifact Hub (artifacthub.io)
    │
    │  scans and indexes your plugin
    │
    ▼
Headlamp Plugin Catalog
    │
    │  reads plugin list from Artifact Hub API
    │  downloads tarball from GitHub release
    │
    ▼
User's Headlamp installation
```

There are **two YAML files** you need to add to your repository:

| File | Location | Purpose |
|------|----------|---------|
| `artifacthub-repo.yml` | Repository root | Declares ownership of the repository |
| `artifacthub-pkg.yml` | Plugin folder root | Describes a single plugin package |

---

## Adding the Artifact Hub Repository File

Create `artifacthub-repo.yml` at the **root of your GitHub repository** (not inside the plugin folder):

```yaml
owners:
  - name: Your Name
    email: your-email@example.com
```

Replace `Your Name` and `your-email@example.com` with your actual name and the email address you will use to register on Artifact Hub. This file is how Artifact Hub verifies that you own the repository you are registering.

If your repository contains multiple plugins (one per folder), a single `artifacthub-repo.yml` at the root covers all of them.

---

## Adding the Artifact Hub Package File

Create `artifacthub-pkg.yml` in the **root of your plugin folder** (next to `package.json`):

```yaml
version: 1.0.0
name: hello-headlamp
displayName: Hello Headlamp
createdAt: "2025-01-20T00:00:00Z"
description: >
  A complete Headlamp plugin tutorial: sidebar navigation, Kubernetes data,
  list and detail views, plugin settings, custom themes, and map visualization.
annotations:
  headlamp/plugin/archive-url: "https://github.com/YOUR_USERNAME/hello-headlamp/releases/download/v1.0.0/hello-headlamp-1.0.0.tar.gz"
  headlamp/plugin/archive-checksum: "SHA256:a3b4c5d6e7f8..."
  headlamp/plugin/version-compat: ">=0.22"
  headlamp/plugin/distro-compat: "in-cluster,web,docker-desktop,desktop"
```

:::tip Real-world example
The [KEDA plugin's `artifacthub-pkg.yml`](https://github.com/headlamp-k8s/plugins/blob/main/keda/artifacthub-pkg.yml) is a good reference for a production-ready file.
:::

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Must match the version in `package.json` and the tag on GitHub |
| `name` | Yes | Unique identifier, lowercase with hyphens or underscores; used in the Artifact Hub URL |
| `displayName` | Yes | Human-readable name shown in the Plugin Catalog |
| `createdAt` | Yes | ISO 8601 timestamp of this release |
| `description` | Yes | Short summary shown in the Plugin Catalog search results |
| `logoURL` | No | URL to a square PNG/SVG logo (recommended for visibility) |

### Annotations reference

The Headlamp-specific metadata goes in the `annotations` block:

| Annotation | Required | Description |
|------------|----------|-------------|
| `headlamp/plugin/archive-url` | Yes | Direct download URL of the `.tar.gz` tarball on GitHub (or GitLab/Bitbucket) |
| `headlamp/plugin/archive-checksum` | Yes | SHA256 checksum of the tarball, prefixed with `SHA256:` (uppercase) — output by `npm run package` |
| `headlamp/plugin/version-compat` | No | Minimum Headlamp version required, as a semver range (e.g. `>=0.22`) |
| `headlamp/plugin/distro-compat` | No | Comma-separated list of Headlamp distributions the plugin works with |

### `distro-compat` values

| Value | Description |
|-------|-------------|
| `in-cluster` | Headlamp running inside a Kubernetes cluster (e.g. via Helm) |
| `web` | Headlamp accessed via browser without a desktop wrapper |
| `docker-desktop` | Headlamp Docker Desktop extension |
| `desktop` | Headlamp desktop application (Windows, macOS, Linux) |
| `linux` | Desktop app on Linux only |
| `windows` | Desktop app on Windows only |
| `mac` | Desktop app on macOS only |

If your plugin works everywhere, use `in-cluster,web,docker-desktop,desktop`. If it relies on a feature only available in the desktop app, list just `desktop`.

### `version-compat` guidance

Check the Headlamp release notes for the version that introduced any API you use. If you are unsure, `>=0.22` is a safe starting point for plugins built with the APIs covered in this tutorial series.

---

## Pushing to GitHub

Add both files to your repository, commit, and push:

```bash
# From the repository root
git add artifacthub-repo.yml hello-headlamp/artifacthub-pkg.yml
git commit -m "chore: add Artifact Hub metadata"
git push origin main
```

If your repository contains only one plugin (the structure used in this series, where the plugin folder is the repo root), both files live in the same directory:

```bash
git add artifacthub-repo.yml artifacthub-pkg.yml
git commit -m "chore: add Artifact Hub metadata"
git push origin main
```

---

## Registering on Artifact Hub

1. Go to [artifacthub.io](https://artifacthub.io) and sign in (or create a free account).
2. Open your **Control Panel** (top-right user menu → Control Panel).
3. Click the **Add** button in the Repositories section.
4. Fill in the form:
   - **Kind:** Headlamp plugin
   - **Name:** A name for the repository entry (e.g. `hello-headlamp`)
   - **Display name:** Human-readable name
   - **URL:** Your GitHub repository URL (e.g. `https://github.com/YOUR_USERNAME/hello-headlamp`)
5. Click **Add**.

Artifact Hub will scan your repository within a few minutes. If it finds a valid `artifacthub-repo.yml` and `artifacthub-pkg.yml`, your plugin will be listed under the **Headlamp** category.

:::info
**Official vs community plugins:** By default, Headlamp's Plugin Catalog only shows plugins that are marked as official in Artifact Hub or are on Headlamp's allow-list. Community plugins are still on Artifact Hub and fully installable — users simply need to enable **"Show all plugins"** in Plugin Catalog settings. This is a safety measure, not a quality bar.
:::

Once indexed, your plugin's Artifact Hub URL will look like:

```
https://artifacthub.io/packages/headlamp/YOUR_REPO/hello-headlamp
```

---

## Releasing Updates

When you make changes and want to publish a new version:

### Run the pre-release checks

```bash
npm run format
npm run lint
npm run tsc
npm run test
```

### Bump the version

Update `version` in `package.json` following SemVer:

```bash
# Using npm's built-in version command (updates package.json and creates a git tag)
npm version patch   # 1.0.0 → 1.0.1  (bug fix)
npm version minor   # 1.0.0 → 1.1.0  (new feature)
npm version major   # 1.0.0 → 2.0.0  (breaking change)
```

Or edit `package.json` manually.

### Build and package

```bash
npm run build
npm run package
```

Note the new checksum in the output.

### Create a new GitHub release

Push the new tag and upload the new tarball:

```bash
git push origin main
git push origin --tags       # pushes the tag created by `npm version`
```

Then create a new GitHub release for the new tag and attach the new `.tar.gz`.

### Update `artifacthub-pkg.yml`

Update three fields:

```yaml
version: 1.0.1                 # ← new version
createdAt: "2025-03-01T00:00:00Z"  # ← today's date
annotations:
  headlamp/plugin/archive-url: "https://github.com/YOUR_USERNAME/hello-headlamp/releases/download/v1.0.1/hello-headlamp-1.0.1.tar.gz"
  headlamp/plugin/archive-checksum: "SHA256:<new-checksum>"  # ← from npm run package output
```

### Commit and push

```bash
git add package.json artifacthub-pkg.yml
git commit -m "chore: release v1.0.1"
git push origin main
```

Artifact Hub will automatically pick up the new `artifacthub-pkg.yml` on its next scan and update the listing. Users who installed the previous version will see an update available in the Plugin Catalog.

---

## What's Next

Congratulations — you have completed the entire **Getting Started** tutorial series! Your `hello-headlamp` plugin now:

- ✅ Adds a button to the app bar
- ✅ Has a sidebar entry and custom pages
- ✅ Fetches and displays Kubernetes data
- ✅ Provides list and detail views with custom columns
- ✅ Extends existing resource detail pages
- ✅ Has a configurable settings page
- ✅ Registers a custom theme
- ✅ Contributes nodes to the Map view
- ✅ Is built, packaged, and published on Artifact Hub

---

## Quick Reference

### Pre-release commands

```bash
npm run format      # auto-format with Prettier
npm run lint        # check for code issues with ESLint
npm run lint-fix    # auto-fix what ESLint can
npm run tsc         # type-check with TypeScript (no output on success)
npm run test        # run Jest unit tests
```

### Release commands

```bash
npm run build       # compile TypeScript → dist/main.js
npm run package     # bundle dist/ → hello-headlamp-X.Y.Z.tar.gz + print checksum
```

### `artifacthub-repo.yml` (repository root)

```yaml
owners:
  - name: Your Name
    email: your-email@example.com
```

### `artifacthub-pkg.yml` (plugin root)

```yaml
version: 1.0.0
name: hello-headlamp
displayName: Hello Headlamp
createdAt: "2025-01-20T00:00:00Z"
description: My Headlamp plugin description.
logoURL: https://raw.githubusercontent.com/YOUR_USERNAME/hello-headlamp/main/logo.png
annotations:
  headlamp/plugin/archive-url: "https://github.com/YOUR_USERNAME/hello-headlamp/releases/download/v1.0.0/hello-headlamp-1.0.0.tar.gz"
  headlamp/plugin/archive-checksum: "SHA256:<checksum from npm run package>"
  headlamp/plugin/version-compat: ">=0.22"
  headlamp/plugin/distro-compat: "in-cluster,web,docker-desktop,desktop"
```

### Useful links

- [Artifact Hub — Headlamp annotations reference](https://artifacthub.io/docs/topics/annotations/headlamp/)
- [Artifact Hub — Headlamp plugin repository format](https://artifacthub.io/docs/topics/repositories/headlamp-plugins)
- [KEDA plugin `artifacthub-pkg.yml`](https://github.com/headlamp-k8s/plugins/blob/main/keda/artifacthub-pkg.yml) — real-world example
- [Headlamp Plugin Catalog README](https://github.com/headlamp-k8s/plugins/tree/main/plugin-catalog#readme)
- [Existing Headlamp plugins on Artifact Hub](https://artifacthub.io/packages/search?kind=21)
- [Plugin publishing guide](https://headlamp.dev/docs/latest/development/plugins/publishing/)
