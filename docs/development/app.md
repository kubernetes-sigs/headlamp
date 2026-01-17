---
title: Desktop App
sidebar_position: 3
---

Headlamp's desktop application is built using Electron. It packages the frontend UI and backend server into a standalone desktop application for Windows, macOS, and Linux.

The desktop app is written in TypeScript and uses Babel to transpile the Electron code. It provides a native desktop experience with features like system tray integration, window management, and plugin support.

## Building and running

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

## Development workflow

The typical development workflow for the desktop app:

1. Make changes to the app code in `app/electron/`
2. Run linting and formatting: `npm run app:lint:fix && npm run app:format`
3. Run type checking: `npm run app:tsc`
4. Test your changes: `npm run app:test`
5. Build and run: `npm run app:start`

## Notes

- The app code in `app/electron/` is written in TypeScript (`.ts` files)
- Babel compiles TypeScript to JavaScript during the build process
- Compiled `.js` files in `app/electron/` are git-ignored
- The app uses the frontend's ESLint and Prettier configuration
- For linting/formatting, the app scripts delegate to the frontend scripts
