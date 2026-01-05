# Copilot Instructions for Headlamp

## Repository Overview

Headlamp is a Kubernetes web UI written in TypeScript (React frontend) and Go (backend). It provides an extensible, vendor-independent dashboard for managing Kubernetes clusters with plugin support.

**Key Components:**
- `frontend/` - React TypeScript application (Material UI, Redux, React Router)
- `backend/` - Go server that proxies K8s API requests and serves plugins
- `app/` - Electron desktop application wrapper
- `plugins/` - Plugin development tools and examples

## Required Versions

- **Node.js**: >=20.11.1
- **npm**: >=10.0.0
- **Go**: 1.24.x

## Build & Development Commands

### Installation (ALWAYS run first)

```bash
# Install root dependencies (required before any other command)
npm install

# Install frontend dependencies (required before frontend commands)
npm run frontend:install

# Build backend binary (required before running backend)
npm run backend:build
```

### Build

```bash
npm run build                    # Build both backend and frontend
npm run frontend:build           # Build frontend only
npm run backend:build            # Build backend only
```

### Development Server

```bash
npm run start                    # Run backend and frontend concurrently
npm run frontend:start           # Frontend dev server at localhost:3000
npm run backend:start            # Backend server (requires backend:build first)
```

### Lint (ALWAYS run before committing)

```bash
npm run lint                     # Lint both backend and frontend
npm run frontend:lint            # Lint frontend (ESLint + Prettier check)
npm run backend:lint             # Lint backend (golangci-lint)
npm run frontend:lint:fix        # Auto-fix frontend lint issues
npm run backend:lint:fix         # Auto-fix backend lint issues
```

### Tests

```bash
npm run test                     # Run all tests
npm run frontend:test            # Frontend tests with coverage (vitest)
npm run backend:test             # Backend tests (go test)
```

### Type Checking

```bash
npm run frontend:tsc             # TypeScript type check
npm run app:tsc                  # App TypeScript check
```

## Project Structure

```
headlamp/
├── frontend/                    # React TypeScript frontend
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── lib/                 # Core libraries and K8s API
│   │   ├── plugin/              # Plugin system
│   │   ├── redux/               # Redux state management
│   │   └── i18n/                # Internationalization
│   ├── package.json             # Frontend dependencies & ESLint config
│   ├── tsconfig.json            # TypeScript configuration
│   └── vitest.config.ts         # Test configuration
├── backend/
│   ├── cmd/                     # Main Go application entry
│   ├── pkg/                     # Go packages (auth, config, helm, etc.)
│   ├── go.mod                   # Go module definition
│   └── .golangci.yml            # Go linter configuration
├── app/                         # Electron desktop app
│   ├── electron/                # Electron main process
│   └── package.json             # App dependencies
├── plugins/
│   ├── headlamp-plugin/         # Plugin development toolkit
│   ├── pluginctl/               # Plugin management CLI
│   └── examples/                # Example plugins
├── package.json                 # Root scripts and dependencies
└── Makefile                     # Alternative build targets
```

## CI Checks (Must Pass Before Merge)

The following checks run on PRs:

1. **Frontend Workflow** (`.github/workflows/frontend.yml`):
   - `make frontend-install && make frontend-lint`
   - `make frontend-install && make frontend-test`
   - `make frontend-i18n-check`
   - `make frontend-install && make frontend-build`

2. **Backend Workflow** (`.github/workflows/backend-test.yml`):
   - `go mod download && golangci-lint run`
   - `make backend && go test ./...`

3. **App Workflow** (`.github/workflows/app.yml`):
   - `make app-test && make app-tsc`

## Code Style Requirements

### Frontend (TypeScript/React)
- License header required on all `.ts/.tsx` files (Apache 2.0, 2025)
- ESLint config in `frontend/package.json`
- Prettier for formatting
- Use `@headlamp-k8s/eslint-config` style

### Backend (Go)
- `golangci-lint` with config in `backend/.golangci.yml`
- Run `npm run backend:format` to format code

### Commit Messages
Format: `<area>: <description>` (max 72 chars)
Examples:
- `frontend: Fix navigation button color`
- `backend: Add cluster configuration endpoint`

## Important Notes

1. **Always run `npm install` and `npm run frontend:install` before any build/test commands**

2. **Backend binary must exist before running**: Run `npm run backend:build` before `npm run backend:start`

3. **i18n check**: If modifying user-facing strings, run `npm run i18n` to update translations

4. **Frontend tests use vitest**: Configuration in `frontend/vitest.config.ts`

5. **Plugin development**: Use `plugins/headlamp-plugin` for creating plugins

6. **Storybook available**: Run `npm run frontend:storybook` for component development

## Validation Checklist

Before submitting changes:
- [ ] `npm run frontend:lint` passes with zero warnings
- [ ] `npm run backend:lint` passes
- [ ] `npm run frontend:test` passes
- [ ] `npm run backend:test` passes
- [ ] `npm run frontend:tsc` passes (for frontend changes)

Trust these instructions. Only search the codebase if the information here is incomplete or found to be incorrect.
