---
title: Desktop App
sidebar_position: 3
---

Headlamp's desktop application is built using Electron. It packages the frontend UI and backend server into a standalone desktop application for Windows, macOS, and Linux.

The desktop app is written in TypeScript and uses Babel to transpile the Electron code. It provides a native desktop experience with features like system tray integration, window management, and plugin support.

## Building and running

First, install the required dependencies by running:

```bash
npm run frontend:install
npm run app:install
```

The desktop app can be quickly built using:

```bash
npm run app:build
```

This command builds the frontend, sets up plugins, and compiles the Electron app into a distributable package.

To build without creating installers (faster for development):

```bash
npm run app:build:dir
```

Once built, it can be run in development mode using:

```bash
npm run app:start
```

For development with live-reload (requires the backend and frontend to be running separately):

```bash
npm run app:start:client
```

Or run everything together:

```bash
npm run start:with-app
```

## Lint

The app code uses the frontend linting configuration. To lint the app/ code:

```bash
npm run app:lint
```

This command can fix some lint issues:

```bash
npm run app:lint:fix
```

## Format

To format the app code:

```bash
npm run app:format
```

## Test

Run unit tests:

```bash
npm run app:test:unit
```

Run end-to-end tests:

```bash
npm run app:test:e2e
```

Run all tests (unit + e2e):

```bash
npm run app:test
```

## Type checking

To check TypeScript types:

```bash
npm run app:tsc
```

## Translations (i18n)

The app uses [i18next](https://www.i18next.com/) for translations. Translation keys are extracted from `app/electron/main.ts` using i18next-parser.

To regenerate translation files after changing translatable strings:

```bash
cd app && npm run i18n
```

To check that translation files are up to date (exits with an error if any file would change):

```bash
npm run app:i18n-check
```

This check runs automatically in CI to prevent translation regressions when code or dependencies change.

## Packaging

To package the app for all platforms:

```bash
npm run app:package
```

Platform-specific packaging:

```bash
npm run app:package:win      # Windows
npm run app:package:linux    # Linux
npm run app:package:mac      # macOS
npm run app:package:win:msi  # Windows MSI installer
```

### Custom product builds

Product builds can select an alternative app build manifest and record the
source revision used to assemble the package:

| Environment variable      | Default                           | Description                                                                                                                          |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `HEADLAMP_BUILD_MANIFEST` | `app/app-build-manifest.json`     | Path to the JSON build manifest. The checked-in default configures both Electron packaging and generated frontend metadata.          |
| `HEADLAMP_SOURCE_COMMIT`  | Current Git revision or `unknown` | Source revision written to `REACT_APP_HEADLAMP_GIT_VERSION`. Set this when building from packaged source without its Git repository. |

The manifest's `product.productName` and `product.version` fields configure the
identity displayed by the frontend as well as the packaged desktop app. Missing
or empty fields retain the values from `app/package.json`.

For example:

```json
{
  "product": {
    "name": "example-desktop",
    "productName": "Example Desktop",
    "version": "1.2.3"
  }
}
```

Build the app with the selected manifest and source revision:

```bash
HEADLAMP_BUILD_MANIFEST=./product/app-build-manifest.json \
HEADLAMP_SOURCE_COMMIT=0123456789abcdef \
npm run app:build
```

Frontend environment generation resolves a relative manifest path from the
`app/` directory. Electron packaging resolves it from the process working
directory. The root app scripts run Electron packaging from `app/`, so the
example above selects `app/product/app-build-manifest.json` for both consumers.
Use an absolute manifest path when invoking either consumer directly from a
different working directory.

The standard `make image` and `npm run image:build` commands pass the current
Git revision to container builds. Direct Docker callers selecting a custom
product manifest should pass both the manifest path and source revision:

```bash
docker buildx build \
  --build-arg HEADLAMP_BUILD_MANIFEST=./product/app-build-manifest.json \
  --build-arg HEADLAMP_SOURCE_COMMIT=0123456789abcdef \
  -f Dockerfile .
```

The manifest must remain available throughout the frontend and app packaging
steps. An unreadable manifest, a non-object `product`, non-string
`productName`/`version` fields, or values containing newlines stop the frontend
build rather than silently using an inconsistent product identity. The frontend
environment generator also rejects values containing both a single quote and a
backtick when they additionally contain either a double quote or a literal
backslash-`n`/backslash-`r` sequence, because no dotenv quote delimiter can
represent them without changing the value.

### Build manifest resources

The `resources` field appends common or platform-specific files and directories
to Electron Builder's existing `extraResources`. Resource `from` paths resolve
from the directory containing the selected manifest:

```json
{
  "resources": {
    "common": [{ "from": "./shared", "to": "shared" }],
    "linux": [{ "from": "./tools/linux", "to": "tools" }],
    "mac": [{ "from": "./tools/mac", "to": "tools", "filter": ["**/*"] }],
    "win": [{ "from": "./tools/windows.exe", "to": "tools/tool.exe" }]
  }
}
```

Only `common`, `linux`, `mac`, and `win` resource groups are supported. Each
group must be an array of objects with a `from` string and optional `to` string
or `filter` string array. Invalid resource configuration stops packaging before
Electron Builder runs.

For example, from the repository root:

```bash
HEADLAMP_BUILD_MANIFEST=./product/app-build-manifest.json npm run app:package
```

#### Packaged resource verification

The `verify` field checks selected files after Electron Builder copies them into
the package. Each entry declares a path relative to the packaged resources
directory and its expected SHA-256 digest:

```json
{
  "verify": [
    {
      "path": "tools/helper",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "platforms": ["linux", "mac"]
    }
  ]
}
```

The optional `platforms` array accepts `linux`, `mac`, and `win`. An entry without
`platforms` applies to every package. Verification stops packaging when a file
is missing, escapes the resources directory, is a directory or symbolic link,
or does not match its declared digest.

## Development workflow

The typical development workflow for the desktop app:

1. Make changes to the app code in `app/electron/`
2. Run linting and formatting: `npm run app:lint:fix && npm run app:format`
3. Run type checking: `npm run app:tsc`
4. If you added or changed translatable strings, regenerate translations: `cd app && npm run i18n`
5. Test your changes: `npm run app:test`
6. Build and run: `npm run app:start`

## Notes

- The app code in `app/electron/` is written in TypeScript (`.ts` files)
- Babel compiles TypeScript to JavaScript during the build process
- Compiled `.js` files in `app/electron/` are git-ignored
- The app uses the frontend's ESLint and Prettier configuration
- For linting/formatting, the app scripts delegate to the frontend scripts
