# AGENTS.md
version: 1
default_agent: "@dev-agent"

> **Consulted files (agent must populate before committing):**  
> 
> **README.md files:**
> - `/README.md` - Main project README
> - `/frontend/README.md` - Frontend-specific README
> - `/backend/README.md` - Backend quickstart guide
> - `/app/README.md` - Desktop app README
> - `/e2e-tests/README.md` - End-to-end testing README
> - `/load-tests/README.md` - Load testing guide
> - `/plugins/README.md` - Plugins overview
> - `/plugins/headlamp-plugin/README.md` - Plugin development tools
> - `/plugins/pluginctl/README.md` - Plugin control utility
> - `/backend/pkg/telemetry/README.md` - Telemetry module
> - `/docker-extension/README.md` - Docker extension
> - `/charts/headlamp/README.md` - Helm chart
> - `/backstage-test/README.md` - Backstage integration test
> - `/tools/i18n/README.md` - Internationalization tools
> - `/eslint-config/README.md` - ESLint configuration
> - `/frontend/src/i18n/README.md` - Frontend i18n
> - `/app/e2e-tests/README.md` - Desktop app e2e tests
> - Plugin examples: `/plugins/examples/*/README.md` (multiple examples)
>
> **Documentation files:**
> - `/docs/development/index.md` - Main development guide with build/run commands
> - `/docs/development/frontend.md` - Frontend development guide
> - `/docs/development/backend.md` - Backend development guide with testing commands
> - `/docs/development/testing.md` - Load testing guide
> - `/docs/development/architecture.md` - Architecture documentation
> - `/docs/development/plugins/index.md` - Plugin system overview
> - `/docs/development/plugins/building.md` - Plugin building guide
> - `/docs/development/plugins/getting-started.md` - Plugin getting started
> - `/docs/development/plugins/publishing.md` - Plugin publishing guide
> - `/docs/development/i18n/index.md` - Internationalization guide
> - `/docs/development/release-guide.md` - Release process
> - `/docs/installation/index.mdx` - Installation instructions
> - `/docs/installation/in-cluster/index.md` - In-cluster deployment
> - `/docs/installation/desktop/index.mdx` - Desktop installation
> - `/docs/contributing.md` - Contribution guidelines
> - `/docs/faq.md` - Frequently asked questions
> - `/docs/platforms.md` - Tested platforms list
>
> **Build/Config files:**
> - `/package.json` - Root package with all npm scripts and Node.js version (>=20.11.1)
> - `/Makefile` - Make targets for building
> - `/backend/go.mod` - Go version (1.24.11)
> - `/CONTRIBUTING.md` - Contributing guidelines
> - `/OWNERS` - Code reviewers and approvers

---

### Agent persona and scope
- **@dev-agent** — pragmatic, conservative, test-first, risk-averse.
- **Scope:** propose, validate, and prepare code/docs patches; run local build/test commands; create PR drafts.
- **Not allowed:** push images/releases, modify CI or infra, or merge without human approval.

---

### Tech stack and environment
- **Languages:** TypeScript (frontend), Go (backend).
- **Runtimes/tools:** 
  - Node.js >=20.11.1 (specified in `/package.json` engines field)
  - npm >=10.0.0 (specified in `/package.json` engines field)
  - Go 1.24.11 (specified in `/backend/go.mod`)
  - Make (for Makefile targets)
- **Reproduce locally:** Use commands from `/package.json` scripts section, `/Makefile`, and documentation files listed above.

---

### Repo map
- **`frontend/`** — UI code (TypeScript/React); see `/frontend/README.md` and `/docs/development/frontend.md` for build/run/test commands.
- **`backend/`** — Go server and API; see `/backend/README.md` and `/docs/development/backend.md` for server commands.
- **`docs/`** — all developer and user docs; reference specific files under `docs/` for workflows.
- **`plugins/`** — plugin system and examples; see `/plugins/README.md` and `/docs/development/plugins/`.
- **`app/`** — desktop application (Electron); see `/app/README.md`.
- **CI & infra:** `.github/workflows/`, Dockerfiles (`/Dockerfile`, `/Dockerfile.plugins`), Kubernetes manifests (`kubernetes-headlamp*.yaml`), Helm charts (`/charts/`) — treat as manual-review-only.

---

### Primary entrypoints (exact commands from repository)

#### Build commands (from `/package.json` and `/docs/development/index.md`):
- **Build everything:** `npm run build` (builds backend and frontend - from `/package.json` line 20)
- **Build frontend only:** `npm run frontend:build` (from `/package.json` line 41, documented in `/docs/development/frontend.md` line 18)
- **Build backend only:** `npm run backend:build` (from `/package.json` line 27, documented in `/docs/development/backend.md` line 21)
- **Build desktop app:** `npm run app:build` (from `/package.json` line 57)

#### Run commands (from `/package.json` and `/docs/development/index.md`):
- **Run both backend and frontend:** `npm start` (from `/package.json` line 22, documented in `/docs/development/index.md` line 48)
- **Run backend only:** `npm run backend:start` (from `/package.json` line 35, documented in `/docs/development/backend.md` line 27)
- **Run frontend only:** `npm run frontend:start` (from `/package.json` line 47, documented in `/docs/development/frontend.md` line 24)
- **Run desktop app:** `npm run app:start` (from `/package.json` line 68)

#### Test commands (from `/package.json` and `/docs/development/backend.md`):
- **Run all tests:** `npm test` (from `/package.json` line 23)
- **Backend tests:** `npm run backend:test` (from `/package.json` line 31, documented in `/docs/development/backend.md` line 55)
- **Backend coverage:** `npm run backend:coverage` (from `/package.json` line 32, documented in `/docs/development/backend.md` line 65)
- **Backend coverage HTML:** `npm run backend:coverage:html` (from `/package.json` line 33, documented in `/docs/development/backend.md` line 60)
- **Frontend tests:** `npm run frontend:test` (from `/package.json` line 46)
- **App unit tests:** `npm run app:test:unit` (from `/package.json` line 65)
- **App e2e tests:** `npm run app:test:e2e` (from `/package.json` line 66)

#### Lint commands (from `/package.json` and `/docs/development/backend.md`):
- **Lint all:** `npm run lint` (from `/package.json` line 24)
- **Lint backend:** `npm run backend:lint` (from `/package.json` line 28, documented in `/docs/development/backend.md` line 35)
- **Lint backend (fix):** `npm run backend:lint:fix` (from `/package.json` line 29, documented in `/docs/development/backend.md` line 41)
- **Lint frontend:** `npm run frontend:lint` (from `/package.json` line 43)
- **Lint frontend (fix):** `npm run frontend:lint:fix` (from `/package.json` line 44)

#### Format commands (from `/package.json` and `/docs/development/backend.md`):
- **Format backend:** `npm run backend:format` (from `/package.json` line 34, documented in `/docs/development/backend.md` line 48)
- **Format and lint frontend:** `npm run frontend:lint:fix` (from `/package.json` line 44)

#### Documentation generation (from `/package.json` and `/docs/development/frontend.md`):
- **Generate API docs:** `npm run docs` (from `/package.json` line 49, documented in `/docs/development/frontend.md` line 38)

#### Storybook (from `/package.json` and `/docs/development/frontend.md`):
- **Run Storybook:** `npm run frontend:storybook` (from `/package.json` line 48, documented in `/docs/development/frontend.md` line 52)
- **Build Storybook:** `npm run frontend:build:storybook` (from `/package.json` line 42)

#### Make targets (from `/Makefile`):
- **Build backend:** `make backend` (from `/Makefile` line 74)
- **Lint backend:** `make backend-lint` (from `/Makefile` line 44)
- **Lint backend (fix):** `make backend-lint-fix` (from `/Makefile` line 47)
- **Build frontend:** `make frontend` (from `/Makefile` line 218)
- **Build container image:** `npm run image:build` (from `/package.json` line 76, documented in `/docs/development/index.md` line 154)

---

### Allowed commands and CI interactions
- **Permitted to suggest/run locally:** 
  - All npm scripts from `/package.json` (lines 16-77)
  - Make targets from `/Makefile` (backend, backend-lint, backend-lint-fix, frontend)
  - Go commands: `go build`, `go test`, `go fmt` (documented in `/docs/development/backend.md`)
  - Node/npm commands: `npm install`, `npm run build`, `npm run test`, `npm start`
- **Require human approval:** 
  - Pushing container images (references in `/docs/development/index.md` line 154)
  - Publishing releases (process documented in `/docs/development/release-guide.md`)
  - Modifying `.github/workflows/*`
  - Changing `Dockerfile` or `/Dockerfile.plugins`
  - Altering Kubernetes manifests (`kubernetes-headlamp*.yaml`)
  - Modifying Helm charts in `/charts/`
- **Reporting CI results:** GitHub Actions workflows in `.github/workflows/` - summarize failing steps, include logs, recommend fixes with local reproduction commands.

---

### Change rules and safety constraints
- **Manual-review-only:** 
  - `.github/workflows/*` - CI workflows
  - `Dockerfile`, `Dockerfile.plugins` - container definitions
  - `charts/` - Helm charts
  - `kubernetes-*.yaml` - Kubernetes manifests
  - `SECURITY.md`, `SECURITY_CONTACTS` - security policy files
  - `OWNERS`, `OWNERS_ALIASES` - maintainer lists (documented in `/OWNERS`)
  - `LICENSE`, `NOTICE` - license files
  - `code-of-conduct.md` - code of conduct
- **Pre-change checks:** 
  - Run `npm run lint` (from `/package.json` line 24)
  - Run `npm test` (from `/package.json` line 23)
  - Run `npm run backend:test` for backend changes (from `/package.json` line 31)
  - Run `npm run frontend:test` for frontend changes (from `/package.json` line 46)
  - Run `npm run backend:format` for backend code formatting (from `/package.json` line 34)
  - Run `npm run frontend:lint:fix` for frontend code formatting (from `/package.json` line 44)
  - Run TypeScript compiler: `npm run frontend:tsc` (from `/package.json` line 45) or `npm run app:tsc` (from `/package.json` line 67)
  - Run e2e tests for UI changes: `npm run app:test:e2e` (from `/package.json` line 66)
- **Dependency updates:** 
  - Open PR with changelog entry
  - Run full test suite: `npm test`
  - Tag maintainers from `/OWNERS` (headlamp-maintainers, headlamp-reviewers)
  - Do not bump major versions without approval
- **Licenses/copyright:** 
  - Do not alter `/LICENSE` or `/NOTICE` files
  - Do not modify copyright headers

---

### Best practices and coding guidelines
- **Reduce solution size:** 
  - Make minimal, surgical changes - modify as few lines as possible to achieve the goal
  - Prefer focused, single-purpose changes over large refactors
  - Break down complex changes into smaller, reviewable increments
  - Remove unnecessary code, dependencies, or complexity when fixing issues
- **Testing best practices:**
  - Avoid using mocks in tests if possible - prefer testing with real implementations
  - Use integration tests over unit tests when it improves test reliability
  - Only mock external dependencies (APIs, databases, file systems) when necessary
  - Write tests that validate actual behavior, not implementation details
- **Consider best practices for the type of change:**
  - **Bug fixes:** Add regression tests, verify the fix doesn't break existing functionality
  - **New features:** Follow existing patterns, add comprehensive tests, update documentation
  - **Refactoring:** Ensure behavior remains unchanged, validate with existing tests
  - **Performance:** Add benchmarks, measure before and after, document improvements
  - **Security:** Follow secure coding practices, validate inputs, avoid common vulnerabilities
  - **Documentation:** Keep it concise, accurate, and consistent with code examples
- **Frontend-specific guidelines:**
  - **Screenshots:** Always include screenshots for UI changes in PRs to show visual impact
  - **React components:** Add Storybook stories with error and loading states for new components (use `npm run frontend:storybook`)
  - **Formatting:** Run `npm run frontend:lint:fix` to format code before committing
  - **End-to-end tests:** For significant UI changes, consider adding or updating e2e tests (`npm run app:test:e2e`)

---

### Examples and templates

#### Example 1: Small frontend code fix
- **Files to change:** `frontend/src/components/Example.tsx` (example path)
- **Rationale:** Fix null-check to avoid runtime error
- **Commands to validate:**
  1. `npm run frontend:install` (from `/package.json` line 39)
  2. `npm run frontend:lint:fix` (from `/package.json` line 44) - format code
  3. `npm run frontend:lint` (from `/package.json` line 43)
  4. `npm run frontend:test` (from `/package.json` line 46)
  5. `npm run frontend:tsc` (from `/package.json` line 45)
  6. `npm run app:test:e2e` (from `/package.json` line 66) - if UI changes
- **Additional requirements:**
  - Include screenshots of any UI changes in the PR
  - If adding/modifying React components, add Storybook stories with error and loading states

#### Example 2: Backend code fix
- **Files to change:** `backend/pkg/example/handler.go` (example path)
- **Rationale:** Fix error handling in API endpoint
- **Commands to validate:**
  1. `npm run backend:build` (from `/package.json` line 27, documented in `/docs/development/backend.md` line 21)
  2. `npm run backend:lint` (from `/package.json` line 28, documented in `/docs/development/backend.md` line 35)
  3. `npm run backend:test` (from `/package.json` line 31, documented in `/docs/development/backend.md` line 55)
  4. `npm run backend:format` (from `/package.json` line 34, documented in `/docs/development/backend.md` line 48)

#### Example 3: Documentation update
- **Files to change:** `docs/development/index.md` (from consulted files list)
- **Rationale:** Clarify local dev startup steps to match current npm scripts
- **Commands to validate:**
  - Run the documented commands exactly as written and confirm they succeed
  - For doc-only changes, testing commands is sufficient; no build needed

#### Example 4: Plugin development
- **Files to change:** Plugin code in `/plugins/examples/` directory
- **Rationale:** Add new plugin example
- **Commands to validate:**
  1. `cd plugins/headlamp-plugin && npm install` (from `/package.json` line 75)
  2. Follow plugin testing commands in `/docs/development/plugins/building.md`

---

### PR description & commit message format
- **PR title template:** 
  - `fix(frontend): short description` for frontend fixes
  - `fix(backend): short description` for backend fixes
  - `docs(dev): update startup steps` for documentation changes
  - `feat(plugins): add new feature` for plugin additions
- **Commit message style:** 
  - Format: `type(scope): short summary`
  - Body: one-paragraph explanation of changes
  - Footer: `Closes #<issue>` if applicable
  - Reference: Follow Kubernetes conventional commits style (see `/CONTRIBUTING.md`)
- **Files to change:** 
  - List minimal files needed
  - Include tests updates if adding/changing functionality
  - Include docs updates if changing user-facing behavior

---

### Agent output checklist (must pass before creating patch/PR)
- **Summary:** one-line intent and short rationale
- **Sources:** list consulted README/docs file paths with specific line numbers
- **Files changed:** explicit file list with rationale for each
- **Diff/patch:** minimal unified diff showing only necessary changes
- **Tests:** 
  - List tests added/updated
  - Exact commands to run them (from `/package.json` or `/Makefile`)
  - Test results showing pass status
- **Local validation:** 
  - Exact commands to reproduce build/test results
  - Output showing successful execution
  - For frontend: verify in browser at `localhost:3000` (from `/docs/development/frontend.md` line 28)
  - For backend: verify server starts successfully (from `/docs/development/backend.md` line 27)
- **CI expectations:** 
  - Which workflows in `.github/workflows/` should pass
  - Expected test coverage (documented in `/docs/development/backend.md` lines 60-67)
- **Reviewers:** 
  - Suggested reviewers from `/OWNERS`: headlamp-maintainers, headlamp-reviewers
  - Tag specific maintainers for specialized areas if needed

---

### Appendix

#### All consulted README.md files:
1. `/README.md` - Main project README with overview, features, quickstart
2. `/frontend/README.md` - Frontend module pointer to docs
3. `/backend/README.md` - Backend quickstart with build/run commands
4. `/app/README.md` - Desktop app information
5. `/e2e-tests/README.md` - End-to-end testing guide
6. `/load-tests/README.md` - Load testing with KWOK
7. `/plugins/README.md` - Plugins overview
8. `/plugins/headlamp-plugin/README.md` - Plugin development tools
9. `/plugins/headlamp-plugin/template/README.md` - Plugin template
10. `/plugins/pluginctl/README.md` - Plugin control utility
11. `/backend/pkg/telemetry/README.md` - Telemetry module
12. `/docker-extension/README.md` - Docker extension
13. `/charts/headlamp/README.md` - Helm chart documentation
14. `/backstage-test/README.md` - Backstage integration
15. `/tools/i18n/README.md` - Internationalization tools
16. `/eslint-config/README.md` - ESLint configuration
17. `/frontend/src/i18n/README.md` - Frontend i18n
18. `/app/e2e-tests/README.md` - Desktop app e2e tests
19. Plugin examples in `/plugins/examples/` (activity, app-menus, change-logo, cluster-chooser, custom-theme, customizing-map, details-view, dynamic-clusters, headlamp-events, pod-counter, projects, resource-charts, sidebar, tables, ui-panels)

#### Key documentation files:
1. `/docs/development/index.md` - Primary development guide (lines 1-310)
2. `/docs/development/frontend.md` - Frontend dev guide (lines 1-82)
3. `/docs/development/backend.md` - Backend dev guide (lines 1-69)
4. `/docs/development/testing.md` - Testing guide (lines 1-83)
5. `/docs/development/architecture.md` - System architecture
6. `/docs/development/plugins/index.md` - Plugin system
7. `/docs/development/plugins/building.md` - Building plugins
8. `/docs/development/plugins/getting-started.md` - Plugin quickstart
9. `/docs/development/plugins/publishing.md` - Publishing plugins
10. `/docs/development/plugins/common-patterns.md` - Plugin patterns
11. `/docs/development/i18n/index.md` - Internationalization
12. `/docs/development/release-guide.md` - Release process
13. `/docs/contributing.md` - Contribution guidelines
14. `/docs/faq.md` - FAQ
15. `/docs/platforms.md` - Tested platforms

#### Changelog entry format:
- Format: `### YYYY-MM-DD - <short title>`
- Content: `- <one-line summary>`
- Include: PR number and author
- Location: Follow existing changelog patterns in repository

#### Versioning guidance:
- Follow semantic versioning (documented in `/docs/development/release-guide.md`)
- App version defined in `/app/package.json` (referenced in `/Makefile` line 16)
- Docker image version from git tags (see `/Makefile` line 11)
- Request maintainer approval for version bumps and releases
- Release process documented in `/docs/development/release-guide.md`

---

## Final instructions for the agent (implementation complete)
1. ✅ **Searched the repository** for all `README.md` files and files under `docs/` - listed their relative paths in "Consulted files" section above
2. ✅ **Extracted exact commands and versions** from package.json, Makefile, go.mod, and documentation - replaced all placeholders with exact text and file path citations (with line numbers where applicable)
3. ✅ **Commands are ready for validation** - all commands listed can be run locally following the exact syntax provided
4. ✅ **File is ready for commit** - consulted-files list is complete and all placeholders have been replaced with exact commands and paths from the repository

**Version Information:**
- Node.js: >=20.11.1 (from `/package.json` line 12)
- npm: >=10.0.0 (from `/package.json` line 13)
- Go: 1.24.11 (from `/backend/go.mod` line 3)

**Key Command Sources:**
- Build/test commands: `/package.json` lines 20-77
- Make targets: `/Makefile` lines 39-310
- Development workflow: `/docs/development/index.md`
- Backend specifics: `/docs/development/backend.md`
- Frontend specifics: `/docs/development/frontend.md`
