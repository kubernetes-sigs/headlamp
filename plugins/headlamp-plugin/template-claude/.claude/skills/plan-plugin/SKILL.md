---
name: plan-plugin
description: Plan this CNCF/CRD Headlamp plugin before any UI code is written. In one holistic pass over ALL the project's CRDs, decide — from the LIVE cluster + seeded data — the scope, the typed resource model, sidebar entries & grouping, per-CRD list columns (from `kubectl get -o wide` + the CRD's printer columns), per-CRD detail layout (from `kubectl describe` + the CRD's openAPIV3Schema), the Map relationships, settings, and i18n/a11y obligations. Writes PLAN.md — the source of truth the build sub-skills consume. Use after setup (cluster chosen, project installed, CRDs discovered, test data seeded) and before /add-list-view, /add-detail-view, /add-settings.
allowed-tools:
  - mcp__kubernetes__*
  - Bash(kubectl get:*)
  - Bash(kubectl describe:*)
  - Bash(kubectl explain:*)
  - Bash(kubectl config get-contexts:*)
  - Bash(kubectl config current-context:*)
  - Write(PLAN.md)
  - Edit(PLAN.md)
  - WebFetch
  - WebSearch
---

# plan-plugin

Plan the whole plugin **once, holistically, from the live cluster** — then build to the plan.
This is the highest-leverage step: a list view is only as good as the column set you derived from
`kubectl get -o wide`, and a detail view is only as complete as the `kubectl describe` you modeled
it from. Plan all CRDs together so the navigation and shared types are coherent, not bolted on.

**This skill writes `PLAN.md` and writes NO code.** The build sub-skills read it. Decide everything
here from real data — never from guessed resource shapes.

## Prerequisites (from setup)

The project is identified, a cluster is chosen, the project is installed, its CRDs are enumerated,
and **test data is seeded and applied** — so `kubectl describe` shows real, populated fields and
`kubectl get -o wide` shows real values. If any are missing, finish setup first (see
`/create-crd-plugin` Phase 0).

## 1) Scope & typed resource model

List **every** CRD in the project's API group(s) (the discovery set). For each, record from the
cluster — don't recall from memory:

- `kubectl get crd <plural>.<group> -o yaml` → **group, version(s), `scope` (Namespaced?), kind,
  plural/singular names**, and the **`spec.versions[].schema.openAPIV3Schema`** (the field shape).
- `kubectl explain <res>.spec` / `.status` to sanity-check the shape interactively.

From that, plan each `src/resources/<name>.ts`: the `spec`/`status` **interface** (`extends
KubeObjectInterface`), the **`class … extends KubeObject<Interface>`** with static
apiVersion/kind/apiName/isNamespaced, and the **typed getters** the views read (`obj.componentType`,
not `obj.jsonData?.spec?.…?`) — including a **`readyStatus`/status getter + a status→severity mapper**
(reused by list + detail). Note shared enums/types → `src/resources/common.ts`. If you intentionally
skip a CRD, say which and why. (This plan is **implemented** by `/define-resource`, the first build
step per CRD — track it separately in Status.)

## 2) Navigation — sidebar entries, grouping, routes

- **Flat by default:** ONE parent entry + one child per CRD.
- **Sub-group when it helps:** if the project has many CRDs *and* they fall into natural sub-domains
  (e.g. Dapr building-blocks vs. management), group children under labelled parents. Judgement call —
  record the grouping and reasoning in PLAN.md for review.
- **Landing page (contextual):** a **small** plugin points the parent entry's `url` at the **primary
  resource list** (no Overview). A **many-CRD / sub-grouped** plugin gets a dedicated **Overview**
  landing page (a dashboard: per-CRD counts, health summary, quick links) — the flux/volcano/cluster-api
  pattern. Decide which here and note it.
- Map each entry to a **route**: cluster-relative `path`, the `component`, and the `sidebar` name
  that highlights it. **Namespace everything under the project** — route `path`s (`/<project>/…`),
  route `name`s and sidebar entry `name`s (`<project>-…`) share a global namespace with Headlamp core
  and other plugins, so prefix them or they collide. Multi-CRD plugins register via a **config array +
  `registerResource()` loop** (`/add-list-view` §2).

## 3) List view columns (per CRD) — curate for value, don't just mirror `kubectl get`

`kubectl get` is the **floor and the candidate source, not the final column set.** Gather the
candidates, then decide which columns genuinely help an operator scan and triage *this* resource —
the goal is a useful table, not a mechanical copy of the printer columns.

- **Candidates** (every column sourced from a real field — never an invented value):
  - `kubectl get <res>` → the default printer columns.
  - `kubectl get <res> -o wide` → the wide extras.
  - the CRD's **`additionalPrinterColumns`** → columns the project itself defines.
  - **the CRD schema / a live object** → high-value `spec`/`status` fields that **no printer column
    exposes** (a ready/phase summary, replica counts, a key target ref, a last-transition reason).
    Add these as columns when they add triage value — printer columns are often a thin subset.
- **Curate:**
  - **Keep the `kubectl get` default columns visible** (what an operator expects) — don't silently
    drop them, unless one is genuinely noise (say why).
  - **Promote to visible** the wide/printer/schema fields users actually scan for (status/ready,
    target, key counts). "Visible" is not limited to the kubectl defaults.
  - **Hide** (`show: false`, toggleable) the lower-value extras — long IDs, verbose internal fields.
  - **Status/health/phase columns must use `StatusLabel`** (severity color + text), not a raw status
    string — via a custom `render` while `getValue` returns the raw string for sort/filter. When the
    status is **condition-backed** (has a reason/message), plan the shared **`ReadyStatusLabel`
    wrapper** (StatusLabel + reason/message tooltip); for a simple enum/phase, bare `StatusLabel` is
    fine. Plan a single status→severity mapping per CRD, reused by the detail view.

Record per column: the source field (a getter from step 1), built-in `ColumnType`
(`'name'`,`'namespace'`,`'age'`, …) vs custom `{ id, label, getValue, render?, show? }`, its
**default visibility, and a one-word why** (so the curation is reviewable). The list renders with
`ResourceListView resourceClass={<Name>}`.

## 4) Detail view layout (per CRD) — from `kubectl describe`

For each CRD, model the page to **`kubectl describe <res>/<name>` parity** — render the WHOLE
object, not a few picked rows:

- `kubectl describe <res>/<name>` (against a seeded instance) + the openAPIV3Schema → enumerate
  every meaningful `spec`/`status` field.
- Plan the layout: headline scalars → `DetailsGrid` `extraInfo`; each logical `spec`/`status` group
  → one `SectionBox`/`NameValueTable` in `extraSections`. **`status.conditions` goes LAST**, via
  `ConditionsSection`, so it sits directly above the auto Events section. (Edit/Delete/Scale/Restart
  header actions are free from DetailsGrid — plan only project-specific ones, see Actions below.)
- Plan **related/owner links** (target Deployment/HPA, Secret, ConfigMap, …) as `Link`s.
- Plan **project-specific actions** (context-dependent — decide per CRD): Edit/Delete/Scale/Restart
  come free from DetailsGrid, so only plan *project* mutations that make sense for this CRD's
  semantics (flux suspend/resume, keda pause, "trigger reconcile", …). Many CRDs need none. For each
  planned action note the API verb/path and the confirm prompt (`/add-detail-view` shows how).
- A **specific free-form field** (embedded YAML/template, script, cert) → an inline read-only Monaco
  `CodeBlock`. (Whole-object YAML is the free default Edit action — don't plan a custom one.) Never a
  `<pre>` dump.

## 5) Settings — plan these EARLY (the views may depend on them)

Settings are not an afterthought: if any view reads a setting (refetch interval, a feature toggle, a
default namespace, default column visibility, a metrics endpoint), the **config module is a
dependency of that view** — so it must be planned now and **built before the views** (see build
order below). Decide:

- **Does the plugin need settings at all?** If genuinely none, say "none" and move on.
- **What each setting is** — name, type, default, and **which views/behaviours consume it**. That
  consumer list is what dictates build order.
- **Scope of each setting — plugin-wide vs. per-cluster.** `ConfigStore` is a single per-browser
  store, so:
  - **Plugin-wide** (the default): one flat config object (e.g. `{ refetchInterval, showRawYaml }`).
  - **Per-cluster**: the same plugin can target many clusters, and a setting may need to differ per
    cluster (a cluster-specific metrics URL, a per-cluster default namespace). Model it by **keying
    the config by cluster name** (`{ clusters: { [cluster]: {...} }, defaults: {...} }`) and reading
    the current cluster's slice via `getCluster()`. Decide per setting which scope it is and record it.
- **Build order:** if any view consumes settings, the orchestrator runs `/add-settings` (at least the
  `src/config.ts` module + defaults) **before** `/define-resource`/`/add-list-view` for the consuming
  CRDs. A settings page that nothing reads can be built last.

## 6) Map, i18n/a11y

- **Map:** plan one leaf `GraphSource` per CRD (nodes from the typed class, edges to related
  objects) grouped under ONE project parent source; note the per-Kind icons. (Both the source
  `icon` *and* `registerKindIcon` are needed — see CLAUDE.md.)
- **i18n / a11y obligations:** list which strings are prose to wrap in `t(...)` vs. plain-English
  labels, and which controls (icon-only buttons, status glyphs) need accessible names.

## Output — write `PLAN.md`

Write a committed `PLAN.md` at the plugin root with these sections (every section is the *current*
truth; build sub-skills update it in place as views land):

```markdown
# <Plugin> — plan
## Project & cluster   — project, group(s), chosen cluster, installed version
## Scope               — every CRD (kind, group/version, namespaced?) + any skip + reason
## Resource model      — per CRD: src/resources/<file>, spec/status interface, getters
## Navigation          — sidebar tree (flat or grouped + why), LANDING (primary list | dedicated Overview), routes
## List views          — per CRD: column table (field/getter, ColumnType|custom, show, status→StatusLabel)
## Detail views        — per CRD: extraInfo scalars, sections (spec/status groups), conditions, links, code blocks
## Actions             — per CRD: project-specific mutations (verb/path/confirm) or "defaults only"
## Map                 — leaf sources, edges, kind icons
## Settings            — needed? per setting: name, type, default, SCOPE (plugin-wide|per-cluster), which views consume it (→ build order). Or "none".
## i18n / a11y         — prose to translate, controls needing accessible names
## Status              — per CRD, distinct steps: model defined (/define-resource) · list (/add-list-view) · detail (/add-detail-view) · verified
```

## Review checkpoint

Before handing off to the build skills, **present the plan to the user** — especially the
**navigation grouping** (the one judgement call) and the **CRD scope**. Adjust on feedback, then
proceed to `/add-list-view` and `/add-detail-view` per CRD.
