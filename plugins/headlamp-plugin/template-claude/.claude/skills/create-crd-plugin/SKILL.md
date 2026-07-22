---
name: create-crd-plugin
description: Day-one buildout of this Headlamp plugin into a complete UI for a CNCF/operator project's CRDs (Dapr, KEDA, Flux, cert-manager, Istio, …). Drives the whole flow against a live cluster: identify the project (inferred from this plugin) → pick the cluster → ensure it is installed (helm) → discover ALL its CRDs → seed test data → plan (sidebar/grouping, list columns from `kubectl get -o wide`, detail layout from `kubectl describe`) → build a list + detail view for every CRD (+ settings if needed) → live-test (incl. a11y + i18n) → document. Use to build this plugin out from an empty/near-empty `src/`. To EXTEND an already-built plugin (add one view, fix a field), call the standalone sub-skills directly instead. Run from the main session — it holds the permission gates.
argument-hint: "[project] — optional; inferred from this plugin (package.json name, the CRDs in src/resources/). Pass only to override."
allowed-tools:
  - mcp__kubernetes__*
  - mcp__helm__install_helm_chart
  - mcp__chrome-devtools__*
  - Bash(kubectl get:*)
  - Bash(kubectl describe:*)
  - Bash(kubectl explain:*)
  - Bash(kubectl config get-contexts:*)
  - Bash(kubectl config current-context:*)
  - Bash(kubectl config use-context:*)
  - Bash(kubectl apply -f test-files:*)
  - Bash(kubectl delete -f test-files:*)
  - Bash(kubectl create namespace:*)
  - Bash(helm version:*)
  - Bash(helm repo:*)
  - Bash(helm install:*)
  - Bash(docker build:*)
  - Bash(kind load:*)
  - Bash(minikube image load:*)
  - Bash(npm install)
  - Bash(npm start)
  - Bash(npm run tsc)
  - Bash(npm run lint)
  - Bash(npm run lint-fix)
  - Bash(npm run build)
  - Bash(npm run i18n)
  - Bash(npm run package)
  - Bash(curl:*)
  - Write(src/**)
  - Edit(src/**)
  - Write(test-files/**)
  - Edit(test-files/**)
  - Write(PLAN.md)
  - Edit(PLAN.md)
  - Write(docs/**)
  - Edit(docs/**)
  - WebFetch
  - WebSearch
---

# create-crd-plugin

The **day-one buildout** loop: turn this scaffolded, near-empty plugin into a complete
operator-project plugin. A CNCF/CRD plugin has a fixed, heavier shape than a one-off contribution: it
needs the project **installed**, **real seeded data**, and a **list + detail view for every one of
the project's CRDs**. This skill sequences those phases and dispatches each to a focused sub-skill.

**Scope — this is the accelerator, not the only door.** Use it once, to go from empty `src/` to a
full first version. After that, the plugin is *maintained and extended* directly through the
standalone sub-skills — `/add-list-view` and `/add-detail-view` add a CRD that shipped later,
`/run-and-verify` re-checks after a Headlamp/toolchain bump, etc. Don't re-run this whole loop to
make a small change.

You (the main session) run this loop because it stops at **⛔ human-permission gates** — choosing
the cluster, installing via helm, and applying fixtures all touch the user's cluster.

**Connective artifact: `PLAN.md`** (committed). The plan phase writes it; every build/test phase
reads it and updates it in place — it is the source of truth *for this initial build* and lets a
collaborator resume. At the document phase it is distilled into `docs/OVERVIEW.md`, which becomes
the permanent record. (When extending an *already-built* plugin, there's no from-zero plan: the
code + `docs/OVERVIEW.md` are the source of truth — update those.)

## Phase 0 — Setup (against a live cluster)

1. **Identify the project.** Infer it from this plugin — the `package.json` `name`/`description`
   and any CRDs already modeled in `src/resources/`. State your inference and confirm with the user;
   the optional `[project]` argument overrides. (This plugin declares what it's for — don't ask for
   what you can read.)
2. **Pick the cluster. ⛔** List configured clusters via the kubernetes MCP (or
   `kubectl config get-contexts`). If more than one, **STOP and ask the user which to use**; with a
   single context, use it and say so. Then **set it once** with `kubectl config use-context <ctx>` and
   run **plain verb-first `kubectl` commands** for the rest of the build (a `--context` flag before the
   verb breaks the `allowed-tools` match and re-prompts every command).
3. **Ensure the project is installed. ⛔** Run **`/ensure-dependency`** — detect whether the
   project's CRDs exist in the chosen cluster; if absent, ask permission and install via the helm
   MCP. Never install without explicit approval.
4. **Discover ALL the CRDs.** `kubectl get crds | grep <group>` (e.g. `dapr.io`) — enumerate the
   project's full CRD set from the **live cluster**, not a memorized list (you will miss newer ones).
   This set is the plugin's scope.
5. **Seed test data. ⛔** Run **`/seed-test-data`** — author sample CRs (from the
   project's docs, validated against the live CRD schema via `kubectl explain` / the CRD's
   `openAPIV3Schema`) into `test-files/`, covering the states the UI must show (healthy / failing /
   paused / …), then `kubectl apply` them (a cluster write — ask first). Without instances the views
   render empty and can't be verified.

## Phase 1 — Plan

Run **`/plan-plugin`**. This is the tunable core. It decides, and writes to `PLAN.md`:

- **Scope** — every CRD from Phase 0.4 (or an explicit, stated reason one is skipped).
- **Navigation** — sidebar entries and their **grouping**: ONE parent entry carrying its own
  landing `url`, a child per CRD, and the route → page mapping.
- **List views** — per CRD, the columns, sourced from `kubectl get <res> -o wide` (defaults visible)
  + the CRD's `additionalPrinterColumns` (extras, hidden/toggleable). Don't invent columns.
- **Detail views** — per CRD, the layout, sourced from `kubectl describe <res>/<name>`: which
  `spec`/`status` groups become sections, Conditions last, related/owner links.
- **Settings** — whether the plugin needs a settings page, and what it controls.
- **i18n / a11y obligations** — which strings get `t(...)`, which controls need accessible names.

## Phase 2 — Build (reading PLAN.md)

**First, settings — if any view consumes them.** If the plan's Settings section lists a setting that
a view reads (refetch interval, feature toggle, default namespace, …), run **`/add-settings`** now —
the `src/config.ts` module is a dependency of those views, so it must exist before them. A settings
page that nothing reads can wait until last. Build it per the planned scope (plugin-wide or
per-cluster).

**Then, for each CRD in scope, in order:**
1. **`/define-resource`** — the typed `src/resources/<name>.ts` class (spec/status interface +
   `extends KubeObject<Interface>` + getters). The foundation the rest reads.
2. **`/add-list-view`** — list page, routes, sidebar entry, not-installed gate, Map source.
3. **`/add-detail-view`** — the describe-parity detail page.

Wire everything from a thin `src/index.tsx`. Update `PLAN.md`'s **Status** as each step lands
(settings → model defined → list → detail → verified).

## Phase 3 — Live-test (non-skippable)

Run **`/run-and-verify`**: `npm start`, then via the chrome-devtools MCP confirm the plugin loads
(no `Plugin execution error`), every contribution renders, **i18n resolves (no blank labels)** and
the **a11y tree** gives every control a name/role. Gate-green ≠ loads (see CLAUDE.md). Fix and
reload until clean.

## Phase 4 — Document

Run **`/document-plugin`** — generate `docs/OVERVIEW.md`: a CRD coverage table (List/Detail ✓) and,
per resource, `kubectl get` beside a list screenshot + `kubectl describe` beside a detail screenshot,
plus Map screenshots. This distills `PLAN.md` into the permanent record.

## Definition of done

Every discovered CRD has a list + detail view; the plugin loads and is verified live (incl. a11y +
i18n); `docs/OVERVIEW.md` exists. Reconcile `PLAN.md` so no section contradicts the shipped reality.
