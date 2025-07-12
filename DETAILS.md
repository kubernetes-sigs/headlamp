# DETAILS.md

🔍 **Powered by [Detailer](https://detailer.ginylil.com)** - AI-driven contextual code analysis



---

## 1. Project Overview

### Purpose & Domain
This project is **Headlamp**, a Kubernetes web UI and desktop application designed to provide cluster administrators and developers with an intuitive interface to manage Kubernetes clusters and resources. It solves the problem of complex Kubernetes cluster management by offering:

- Real-time cluster resource visualization and monitoring
- Plugin extensibility for custom features and UI components
- Multi-cluster management with dynamic cluster loading
- Integrated telemetry and observability dashboards
- Cross-platform desktop support via Electron

### Target Users & Use Cases
- Kubernetes cluster administrators seeking a unified, user-friendly dashboard
- Developers needing quick access to cluster resources and logs
- DevOps teams requiring integrated monitoring and alerting
- Plugin developers extending Headlamp with custom functionality
- Users preferring a desktop app experience with Electron

### Core Business Logic & Domain Models
- Kubernetes resource management (Pods, Deployments, Services, Nodes, etc.)
- Cluster context and multi-cluster support
- Plugin lifecycle management (install, update, uninstall)
- Real-time event handling and notifications
- Resource visualization via graphs and charts
- Authentication and authorization integration (OIDC, tokens)

---

## 2. Architecture and Structure

### High-Level Architecture
- **Frontend:** React-based SPA with TypeScript, Material-UI, React Query, and Redux Toolkit for state management. Supports plugin extensions and dynamic UI composition.
- **Backend:** Go-based HTTP server exposing Kubernetes API proxy, WebSocket multiplexing, plugin serving, and telemetry endpoints.
- **Electron App:** Desktop shell managing window lifecycle, backend process spawning, IPC communication, and plugin management.
- **Plugins:** Modular extensions written in TypeScript/React, dynamically loaded and registered via plugin APIs.
- **CI/CD & DevOps:** GitHub Actions workflows for build, test, release, and deployment automation.
- **Testing:** End-to-end tests with Playwright, unit tests with Vitest and Jest, Storybook for UI component testing.

### Complete Repository Structure (abridged for clarity)

```
.
├── .github/
│   ├── workflows/ (CI/CD YAML files)
│   ├── ct.yaml
│   ├── cr.yaml
│   └── pull_request_template.md
├── app/
│   ├── electron/ (Electron main process and IPC)
│   ├── e2e-tests/ (End-to-end tests)
│   ├── scripts/ (Build and packaging scripts)
│   ├── windows/ (Windows packaging and signing)
│   ├── app-build-manifest.json
│   ├── package.json
│   └── tsconfig.json
├── backend/
│   ├── cmd/ (Backend server entry points and API handlers)
│   ├── pkg/ (Backend packages: cache, kubeconfig, helm, telemetry, portforward, exec)
│   ├── go.mod
│   └── README.md
├── charts/
│   └── headlamp/ (Helm chart for Headlamp deployment)
│       ├── templates/ (Kubernetes manifests)
│       ├── tests/ (Helm chart tests)
│       ├── Chart.yaml
│       ├── values.yaml
│       └── values.schema.json
├── docker-extension/ (Docker Desktop extension for Headlamp)
├── docs/
│   ├── development/ (API docs, development guides, testing docs)
│   ├── installation/
│   └── faq.md
├── e2e-tests/ (End-to-end tests for frontend)
├── eslint-config/ (Shared ESLint and Prettier config)
├── frontend/
│   ├── .storybook/ (Storybook config and mocks)
│   ├── src/
│   │   ├── components/ (1000+ React components, organized by feature)
│   │   ├── helpers/ (Utility functions)
│   │   ├── i18n/ (Localization files and config)
│   │   ├── lib/ (Kubernetes API abstractions, utilities, plugin system)
│   │   ├── redux/ (Redux slices and store)
│   │   └── index.tsx (React app entry)
│   ├── public/ (Static assets)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── load-tests/ (Load testing scripts and configs)
├── plugins/
│   ├── examples/ (Example plugins: change-logo, pod-counter, resource-charts, etc.)
│   ├── headlamp-plugin/ (Core plugin SDK and shared components)
│   └── pluginctl/ (Plugin CLI tool and multi-plugin management)
├── tools/
│   └── releaser/ (Release automation CLI tool)
├── Makefile
├── Dockerfile
├── Dockerfile.plugins
├── cloudbuild.yaml
└── README.md
```

---

## 3. Technical Implementation Details

### Frontend

- **React & TypeScript:** Modular components organized by feature (e.g., `components/cluster`, `components/pod`, `components/namespace`).
- **State Management:** Redux Toolkit slices (`configSlice`, `drawerModeSlice`, `filterSlice`, `headlampEventSlice`, etc.) manage global and feature-specific state.
- **Data Fetching:** React Query hooks (`useList`, `useGet`) abstract Kubernetes API calls with caching and real-time updates.
- **UI Components:** Material-UI for styling, Storybook for component development and testing.
- **Plugin System:** Plugins register UI components, routes, menus, and actions via a centralized registry (`plugin/registry.tsx`), exposing APIs like `registerAppLogo`, `registerRoute`, `registerSidebarEntry`.
- **Resource Models:** Typed Kubernetes resource classes (`lib/k8s/`) encapsulate resource data and API interactions.
- **Graph Visualization:** Resource maps and graphs implemented with `@xyflow/react`, supporting node grouping, filtering, and layout via ELK.
- **Localization:** i18next-based system with modular JSON locale files per language (`frontend/src/i18n/locales/`).

### Backend

- **Go Server:** Implements Kubernetes API proxy, WebSocket multiplexing, plugin serving, telemetry endpoints.
- **Cache & Context Management:** In-memory caches for cluster contexts, kubeconfig parsing, and stateless cluster support.
- **Helm Integration:** Backend Helm API handlers for chart and release management.
- **Port Forwarding:** API endpoints and handlers for Kubernetes port forwarding.
- **Telemetry:** OpenTelemetry integration with Prometheus and Jaeger exporters.
- **Plugin Management:** Backend plugin lifecycle management, including installation, update, and removal.

### Electron App

- **Main Process:** Manages window lifecycle, backend server process spawning, IPC communication, plugin management.
- **Renderer Process:** Loads frontend React app.
- **Plugin IPC:** Handles plugin install/update/uninstall commands via IPC.
- **Zoom & UI Settings:** Persistent zoom factor management.
- **Menu Management:** Dynamic menu creation and updates based on loaded plugins.

### Plugin System

- **Plugin Registration:** Plugins register UI components, routes, menus, and actions via exposed APIs.
- **Plugin Lifecycle:** Managed via Electron main process and backend server, supporting install, update, uninstall.
- **Plugin SDK:** Provides React components, configuration stores, and registration utilities.
- **Example Plugins:** Demonstrate usage of plugin APIs for UI extension, resource charts, event notifications, cluster chooser overrides, and custom themes.

### CI/CD & Build

- **GitHub Actions:** Multiple workflows for linting, testing, building, releasing Helm charts and Docker images.
- **Makefile:** Orchestrates build, test, lint, packaging, and deployment tasks across backend, frontend, and plugins.
- **Release Automation:** CLI tool (`tools/releaser`) for managing releases, tagging, and publishing assets.
- **Docker:** Multi-stage Dockerfiles for app and plugins, including Electron app packaging.
- **Testing:** Playwright for E2E tests, Vitest and Jest for unit tests, Storybook for UI component testing.

---

## 4. Development Patterns and Standards

- **Code Organization:**
  - Feature-based directory structure in frontend (`components/feature`).
  - Modular backend packages (`pkg/feature`).
  - Plugins as self-contained modules with own configs and tests.
- **Type Safety:**
  - Extensive use of TypeScript interfaces and classes for Kubernetes resources and plugin APIs.
- **State Management:**
  - Redux Toolkit slices with actions, reducers, and selectors.
  - React Query for data fetching and caching.
- **Testing:**
  - Unit tests with Vitest/Jest.
  - E2E tests with Playwright.
  - Storybook stories for UI components.
- **Error Handling:**
  - Centralized error types (`ApiError`).
  - Middleware for event handling and error propagation.
- **Configuration Management:**
  - Environment variables injected at build time.
  - Local storage for persistent UI settings.
- **Internationalization:**
  - i18next with modular JSON locale files.
  - React hooks for translation.
- **Plugin Development:**
  - Plugin SDK with registration APIs.
  - Plugin lifecycle management via Electron IPC and backend APIs.
  - Example plugins demonstrating best practices.
- **Build & CI/CD:**
  - Multi-stage Docker builds.
  - GitHub Actions workflows for automation.
  - Makefile for local build orchestration.
- **UI Patterns:**
  - Container-Presenter separation.
  - Hook-based state and effect management.
  - Component composition and reuse.
  - Accessibility considerations (aria attributes, keyboard navigation).

---

## 5. Integration and Dependencies

### External Libraries
- **Frontend:**
  - React, React Router, Material-UI, React Query, Redux Toolkit, i18next, Storybook, Vitest, Playwright.
  - Charting libraries (`recharts`, `victory`), terminal emulation (`xterm`).
  - Utility libraries (`lodash`, `semver`, `js-yaml`).
- **Backend:**
  - Go standard library, Kubernetes client-go, OpenTelemetry SDK, Prometheus client, Helm SDK.
- **Electron:**
  - Electron core modules, child_process, IPC.
- **Plugins:**
  - Headlamp plugin SDK, React, Material-UI.
- **Build & CI/CD:**
  - Docker, GitHub Actions, Make, Node.js, npm/yarn.

### Internal Modules
- **Frontend:**
  - `lib/k8s/` resource models and API clients.
  - `plugin/` plugin management and registry.
  - `redux/` state slices and middleware.
  - `helpers/` utility functions.
- **Backend:**
  - `pkg/` modular backend packages.
- **Plugins:**
  - Self-contained modules with own source, tests, and configs.

### API Dependencies
- Kubernetes API server (proxied via backend).
- Helm API for chart management.
- GitHub API for release automation.
- Electron IPC for desktop app communication.
- Plugin APIs for UI extension and lifecycle.

---

## 6. Usage and Operational Guidance

### Getting Started
- **Frontend:**
  - Run `npm install` in `frontend/`.
  - Use `npm run dev` or `npm start` to launch the development server.
  - Use Storybook (`npm run storybook`) for UI component development.
- **Backend:**
  - Build with `make backend` or `go build`.
  - Run backend server standalone or via Electron app.
- **Electron App:**
  - Use `npm run electron` or `make app` to build and run the desktop app.
- **Plugins:**
  - Develop plugins under `plugins/examples/`.
  - Use `headlamp-plugin` CLI for building, testing, and running plugins.
- **Testing:**
  - Run unit tests with `npm test` or `vitest`.
  - Run E2E tests with Playwright via `npm run e2e`.
- **Release:**
  - Use `tools/releaser` CLI for managing releases, tagging, and publishing assets.
  - CI/CD pipelines automate build, test, and release via GitHub Actions.

### Plugin Development
- Use the plugin SDK (`plugins/headlamp-plugin`) for registration and lifecycle.
- Register UI components, routes, menus, and actions via `plugin/registry.tsx`.
- Follow example plugins for best practices.
- Use Storybook for isolated UI development.
- Plugins can extend resource maps, charts, notifications, and cluster management.

### Configuration
- Environment variables control backend URLs, feature flags, and build modes.
- Local storage persists UI preferences (theme, table rows, recent clusters).
- i18n supports multiple languages; add locales under `frontend/src/i18n/locales/`.

### Observability & Monitoring
- Backend exposes Prometheus and Jaeger endpoints.
- Frontend includes telemetry dashboards and charts.
- Use provided Helm charts for Kubernetes deployment.

### Troubleshooting & Maintenance
- Use logs from backend and Electron main process for debugging.
- Use `make lint` and `make test` to ensure code quality.
- Use Storybook and unit tests to validate UI changes.
- Follow contribution guidelines in `CONTRIBUTING.md`.

---

# Summary

This repository implements a comprehensive Kubernetes management platform with a rich frontend UI, backend API proxy, Electron desktop app, and extensible plugin system. It employs modern web technologies, robust state management, and modular architecture to deliver a scalable, maintainable, and user-friendly solution. The project includes extensive CI/CD automation, testing infrastructure, and developer tooling to support continuous development and deployment.

---

# Actionable Insights for AI Agents and Developers

- **Navigating the Codebase:**
  - Frontend React components are under `frontend/src/components/`.
  - Backend Go code is under `backend/pkg/` and `backend/cmd/`.
  - Electron main process code is in `app/electron/`.
  - Plugins reside in `plugins/`, with examples under `plugins/examples/`.
  - Helm charts and Kubernetes manifests are under `charts/headlamp/`.
  - CI/CD workflows are in `.github/workflows/`.
  - Utility and shared code are in `frontend/src/lib/` and `frontend/src/helpers/`.

- **Extending Functionality:**
  - Use the plugin SDK (`plugins/headlamp-plugin`) and registration APIs (`plugin/registry.tsx`) to add new UI components or resource handlers.
  - Follow existing plugin examples for structure and best practices.
  - Use Storybook for UI component development and testing.

- **Building & Testing:**
  - Use `Makefile` targets for building backend, frontend, and Electron app.
  - Run unit tests with Vitest/Jest and E2E tests with Playwright.
  - Use GitHub Actions workflows for automated CI/CD.

- **Localization:**
  - Add new languages by adding JSON files under `frontend/src/i18n/locales/`.
  - Use `i18next` translation keys consistently in UI components.

- **Debugging & Monitoring:**
  - Backend logs and Electron main process logs are primary debugging sources.
  - Use Prometheus and Jaeger for monitoring cluster and app health.

- **Configuration:**
  - Environment variables and local storage control runtime behavior and user preferences.
  - Use `make-env.js` and `.env` files for build-time configuration.

---

# End of DETAILS.md