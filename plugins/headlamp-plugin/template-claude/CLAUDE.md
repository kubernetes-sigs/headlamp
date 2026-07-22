# Headlamp plugin — agent rules

This is a **Headlamp plugin**: React 18 + TypeScript + MUI v5, built by the
`@kinvolk/headlamp-plugin` toolchain into `dist/main.js`. At runtime the Headlamp frontend
fetches that bundle and runs it; the plugin's job is to call `register*` functions to extend
the UI. Plugins **never call the kube-apiserver directly** — all cluster data flows through the
Headlamp backend proxy via the lib's `K8s` / `ApiProxy` helpers.

This file is always-on policy. Step-by-step workflows live in [.claude/skills/](.claude/skills/).
- **Building this plugin out for the first time (CNCF/CRD project)?** Run `/create-crd-plugin` —
  the day-one loop (cluster → install → seed data → plan → build → live-test → document).
- **Maintaining or extending an existing plugin?** Call the sub-skills directly — `/define-resource`,
  `/add-list-view`, `/add-detail-view`, `/add-settings`, `/run-and-verify`. They work standalone;
  don't re-run the whole loop for a small change.

## Commands (run in this plugin folder)

- `npm start` — watch + rebuild into Headlamp's **dev-plugins** dir; the desktop app hot-reloads. Primary dev loop.
- `npm run tsc` — type-check (gate). `npm run lint` / `lint-fix` — eslint, the **a11y gate** (`jsx-a11y/recommended`).
- `npm run build` — production build → `dist/main.js`. `npm run test` — vitest.
- `npm run i18n` — extract `t(...)` keys into `locales/<lang>/translation.json`. `npm run package` — `.tar.gz` tarball.

Don't reference scripts that aren't in `package.json`; fall back to `npx @kinvolk/headlamp-plugin <cmd>`.

**Run bash commands directly — your working directory is already the plugin root. Do NOT prefix with
`cd <plugin>; …`** (the cwd persists between calls). A `cd …;` prefix makes the command start with `cd`,
which matches none of the permission allow-rules and forces a needless approval prompt for every command.
Prefer the dedicated Read/Grep/Glob tools over `cat`/`ls`/`find`/`grep`, and don't use `echo` for
section headers — just write prose.

## Golden rules

- **The toolchain owns config.** Don't hand-edit `package.json` build fields, `tsconfig.json`, or
  webpack/vite config — `@kinvolk/headlamp-plugin` owns them.
- **`src/index.tsx` is registration-only.** UI lives in `src/components/<resource>/{List,Detail}.tsx`
  + `src/components/common/`; typed custom-resource classes in `src/resources/`; the Map in
  `src/mapView.tsx`; settings in `src/config.ts` + `src/settings.tsx`. Don't drop loose components at
  `src/` root or invent a flat `src/views/`.
- **Use function-style `register*`** (`registerSidebarEntry`, `registerRoute`,
  `registerDetailsViewSection`, …) from `@kinvolk/headlamp-plugin/lib`. The class API
  (`Plugin.initialize` / `Headlamp.registerPlugin`) is legacy — only for editing existing legacy code.
- **Reuse the lib before writing UI.** Pull `SectionBox`, `SimpleTable`, `NameValueTable`, `Link`,
  `Loader`, `ResourceListView`, `DetailsGrid`, `ConditionsTable`, … from
  `@kinvolk/headlamp-plugin/lib/CommonComponents`, and `@mui/material`, before custom components.
  Import MUI **per component**: `import Box from '@mui/material/Box'`.

- **⚠ Runtime externalization — import VALUES only from externalized barrels (this is the #1
  silent load-crash, and `tsc`/`lint`/`build` CANNOT catch it).** The build marks
  `@kinvolk/headlamp-plugin/lib` (+ submodules), React, MUI, `@iconify/react`, `@monaco-editor/react`
  and more as *external*; at runtime they resolve to Headlamp globals (`pluginLib.*`). A deep import
  path is rewritten to a global by prefix — e.g. `…/lib/k8s/cluster` → `pluginLib.K8s.cluster.*`. If
  that global doesn't actually exist at runtime, the **value is `undefined` at load and crashes the
  whole plugin** — while the build stays green because the *type* resolved from the `.d.ts`. So:
  - Import **values** (a class you `extends`, a function you call, a component you render) from a
    documented, externalized path: `@kinvolk/headlamp-plugin/lib`, `/lib/CommonComponents`,
    `/lib/k8s/cluster` (→ `pluginLib.K8s.cluster` — `KubeObject` lives here), `/lib/K8s`, `/lib/Utils`,
    `/lib/ApiProxy`, `/lib/Router`, `/lib/Notification`, `/lib/Crd`. The externalized-modules map is
    `node_modules/@kinvolk/headlamp-plugin/config/vite.config.mjs`.
  - **Typed custom resources use `class X extends KubeObject<XInterface>`** with `KubeObject` +
    `KubeObjectInterface` value/type-imported from `@kinvolk/headlamp-plugin/lib/k8s/cluster` — the
    standard across the official CNCF plugins (keda, cert-manager, …) and runtime-safe (it resolves to
    `pluginLib.K8s.cluster.KubeObject`, which IS provided). See [/define-resource]. (`makeCustomResourceClass`
    from `/lib/Crd` is the alternative for factory/dynamic CRDs generated from config — radius/karpenter.)
  - Import **types** from any deep path (`import type { ... } from
    '@kinvolk/headlamp-plugin/lib/k8s/...'`) — types are erased at build, so deep type imports are safe.
  - **The trap is importing a value from a NON-externalized deep path** — it rewrites to a `pluginLib.*`
    global that doesn't exist → `undefined` at load → the whole plugin crashes, while the build stays
    green (the type resolved from the `.d.ts`). **Only a live load proves a value import works** (see
    Definition of done). Re-check after every new value import or `extends`.

- **i18n user-facing prose; keep a11y green.** Wrap genuine prose (titles, descriptions,
  status/empty/error messages, buttons, dialogs, settings) in `t(...)` — `const { t } =
  useTranslation();` from `@kinvolk/headlamp-plugin/lib`. Short column/field labels (`Name`, `Type`,
  `Age`) may stay plain English. `useTranslation` is a hook — labels passed at module scope
  (sidebar/route names) stay plain English. Run `npm run i18n` and ensure `en` values are non-empty
  (empty value → `t('X')` renders blank). For a11y: keep `npm run lint` clean, give icon-only controls
  an accessible name, never encode meaning in color/glyph alone.

CRD-specific craft (typed classes, `kubectl get`/`describe` parity, the Map + icon traps, the
not-installed banner) is in the skills — pulled in on demand, not pasted here.

## Definition of done — gate-green ≠ loads

A plugin is "working" only after, in order:

1. `npm run tsc` clean → 2. `npm run lint` clean (also the a11y gate) → 3. `npm run build` produces `dist/main.js`.
4. **Live-load smoke check — NON-SKIPPABLE.** `tsc`/`lint`/`build` passing does **not** mean the plugin
   loads (a value imported from a non-externalized path is `undefined` at runtime and crashes the
   plugin while the build stays green — see the externalization rule). With Headlamp running and the
   plugin loaded, via the chrome-devtools MCP:
   - (a) `list_console_messages` shows **no `Plugin execution error in <name>`** and no plugin errors;
   - (b) `take_snapshot` confirms the plugin's actual contribution is in the DOM/a11y tree (sidebar
     entry / route renders / widget shows) — not just "the app loaded";
   - (c) **i18n resolves** — custom labels/headers show real text, not blank (a stale/empty locale
     bundle makes `t('X')` return `''`; built-in columns still show because they use core namespaces);
   - (d) the a11y tree gives every interactive control a name/role.

   Re-run this whenever you add a new **value import** or an `extends`. "Gate-green" is not "loads."

## register* quick reference (from `@kinvolk/headlamp-plugin/lib`)

- `registerSidebarEntry({ name, label, url?, parent?, icon?, sidebar? })` — `parent` nests it; for a
  multi-resource plugin register ONE parent that carries its own landing `url` + a child per resource.
  Landing = the primary list for a small plugin, or a dedicated **Overview** page for a many-CRD one
  (see [/plan-plugin]). Drive multi-CRD registration from a config array + a `registerResource()` loop.
- `registerRoute({ path, sidebar, component, exact?, name? })` — `path` is cluster-relative.
  **Namespace everything under the project name** to avoid clashing with Headlamp core routes and other
  plugins (one global namespace): route `path` → `/<project>/…`; route `name`, sidebar entry `name`,
  table `id` → `<project>-…` (use the `package.json` name as `<project>`).
- `registerDetailsViewSection` / `registerDetailsViewHeaderAction` / `registerResourceTableColumnsProcessor`
  — extend built-in resource pages.
- `registerMapSource(source)` / `registerKindIcon(kind, { icon, color })` — Map/topology + Kind icons.
- `registerPluginSettings(name, Component, displaySaveButton?)` — settings page.
- Cluster data: `K8s.ResourceClasses.<Kind>.useList(...)` / `.useGet(...)`; custom resources via your
  typed `src/resources/<name>.ts` class (`<Name>.useList()`, `resourceClass={<Name>}`).
- Writes/uncovered endpoints: `ApiProxy.request(path, { cluster, method?, body? })`.

Confirm exact signatures against `node_modules/@kinvolk/headlamp-plugin/examples/` and
`official-plugins/` (keda, cert-manager, flux), and the
[API reference](https://headlamp.dev/docs/latest/development/api/).
