---
title: NPM Scripts
---

# NPM Scripts Reference

Headlamp provides npm scripts as a convenient way to build, run, and test all components. The root `package.json` contains simple wrapper scripts that delegate to each component's directory.

## Overview

This implementation provides an alternative to Make commands **without using npm workspaces**:
- Each component (frontend, app, backend) remains independent with its own `package.json`
- Scripts use simple `cd <dir> && <command>` delegation
- Only adds `concurrently` as a development dependency for parallel execution
- Works alongside the existing Makefile for backward compatibility

## Quick Reference

### Common Commands

```bash
# Install all dependencies and build backend
npm run install:all

# Start development (backend + frontend in parallel)
npm start

# Run all tests
npm test

# Build everything for production
npm run build

# Clean build artifacts
npm run clean
```

## Installation Scripts

| Script | Description |
|--------|-------------|
| `install:all` | Install frontend and app dependencies, build backend |
| `install:frontend` | Install frontend dependencies only |
| `install:backend` | Build the backend binary (Go doesn't need npm install) |
| `install:app` | Install app dependencies only |

## Build Scripts

| Script | Description |
|--------|-------------|
| `build` | Build backend and frontend for production |
| `backend:build` | Build the Go backend binary |
| `frontend:build` | Build the React frontend for production |
| `frontend:build:storybook` | Build Storybook documentation |
| `app:build` | Build the Electron desktop app (includes frontend build) |
| `app:build:dir` | Build app without packaging |

## Development Scripts

| Script | Description |
|--------|-------------|
| `start` | Start backend + frontend in parallel (color-coded output) |
| `dev` | Alias for `start` |
| `backend:start` | Start backend in development mode with test token |
| `backend:dev` | Start backend with Air for auto-reload |
| `backend:start:metrics` | Start backend with Prometheus metrics enabled |
| `backend:start:traces` | Start backend with distributed tracing enabled |
| `frontend:start` | Start frontend dev server with hot reload |
| `frontend:storybook` | Run Storybook component explorer |
| `app:start` | Start the desktop app (requires backend + frontend) |
| `app:start:client` | Start app only (if backend/frontend already running) |
| `start:with-app` | Start backend + frontend + app together |
| `start:app` | Alias for `app:start` |
| `start:backend` | Build and start backend |
| `start:frontend` | Start frontend dev server |

## Test Scripts

| Script | Description |
|--------|-------------|
| `test` | Run backend and frontend tests |
| `backend:test` | Run Go tests with verbose output |
| `backend:coverage` | Run tests with coverage report to console |
| `backend:coverage:html` | Run tests with HTML coverage report |
| `frontend:test` | Run React tests with coverage |
| `frontend:tsc` | Run TypeScript compiler check |
| `app:test` | Run all app tests (unit + e2e) |
| `app:test:unit` | Run app unit tests with Jest |
| `app:test:e2e` | Run app end-to-end tests with Playwright |
| `app:tsc` | Run TypeScript compiler check for app |
| `plugins:test` | Test the plugin system and examples |

## Lint Scripts

| Script | Description |
|--------|-------------|
| `lint` | Lint backend and frontend code |
| `lint:fix` | Lint and auto-fix backend and frontend code |
| `backend:lint` | Lint Go code with golangci-lint |
| `backend:lint:fix` | Lint and auto-fix Go code |
| `backend:install:linter` | Install golangci-lint to backend/tools/ |
| `backend:format` | Format Go code with `go fmt` |
| `frontend:lint` | Lint frontend code (includes format check) |
| `frontend:lint:fix` | Lint and auto-fix frontend code (includes formatting) |

## Packaging Scripts

| Script | Description |
|--------|-------------|
| `app:package` | Package app for all platforms (Linux, Mac, Windows) |
| `app:package:linux` | Package app for Linux (AppImage, deb, rpm) |
| `app:package:mac` | Package app for macOS (dmg, zip) |
| `app:package:win` | Package app for Windows (exe installer) |
| `app:package:win:msi` | Package Windows MSI installer |

## Documentation Scripts

| Script | Description |
|--------|-------------|
| `docs` | Generate TypeScript API documentation with TypeDoc |
| `i18n` | Update translation files from source code |
| `i18n:check` | Check if translation files need updates (CI) |

## Other Scripts

| Script | Description |
|--------|-------------|
| `clean` | Remove all build artifacts and node_modules |
| `image:build` | Build Docker container image |

## Usage Examples

### First Time Setup

```bash
# Clone the repository
git clone https://github.com/kubernetes-sigs/headlamp.git
cd headlamp

# Install dependencies and build backend
npm run install:all

# Start development servers
npm start
```

Now open your browser to `http://localhost:3000`.

### Development Workflow

```bash
# Make changes to frontend or backend
# The dev servers will auto-reload

# Run tests before committing
npm test

# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Building for Production

```bash
# Build backend and frontend
npm run build

# Build the desktop app
npm run app:build

# Package for specific platform
npm run app:package:linux
npm run app:package:mac
npm run app:package:win
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific component tests
npm run backend:test
npm run frontend:test
npm run app:test:unit

# Get test coverage
npm run backend:coverage:html
npm run frontend:test  # includes coverage by default
```

### Working with Internationalization

```bash
# After adding new translatable strings
npm run i18n

# Check if translations need updating (in CI)
npm run i18n:check
```

## CI/CD Usage

The npm scripts work well in CI/CD environments:

```bash
# Install dependencies (CI mode for frontend)
npm run frontend:install:ci

# Run linting
npm run lint

# Run all tests
npm test

# Build for production
npm run build

# Package the app
npm run app:package:linux
```

## Troubleshooting

### Build Issues

```bash
# Clean everything and rebuild
npm run clean
npm run install:all
npm run build
```

### Backend Issues

```bash
# Rebuild the backend
npm run backend:build

# Check Go environment
cd backend
go env
```

### Frontend Issues

```bash
# Reinstall frontend dependencies
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### App Issues

```bash
# Reinstall app dependencies
cd app
rm -rf node_modules
npm install
```

## Notes

- **Parallel Execution**: The `start` command uses `concurrently` to run backend and frontend simultaneously with color-coded output (blue for backend, green for frontend).
- **Background Processes**: Some scripts like `backend:start` run in development mode with special flags (test token, Helm enabled, etc.).
- **Platform Compatibility**: All scripts work on Linux, macOS, and Windows.
- **No Workspaces**: Unlike other approaches, this doesn't use npm workspaces - each component remains independent.
