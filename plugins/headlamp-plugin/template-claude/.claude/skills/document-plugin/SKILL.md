---
name: document-plugin
description: Generate docs/OVERVIEW.md for this built plugin — a CRD coverage table (List/Detail ✓), and per resource the live `kubectl get -o wide` output beside a list-view screenshot and the full `kubectl describe` output beside a detail-view screenshot, Map screenshots, and the settings page (if any) with a per-setting scope/default/effect table. Captures screenshots via the chrome-devtools MCP against the running app. Use after live verification (the final phase), while Headlamp is still up. Distills PLAN.md into the permanent record.
allowed-tools:
  - mcp__chrome-devtools__*
  - Bash(kubectl get:*)
  - Bash(kubectl describe:*)
  - Write(docs/**)
  - Edit(docs/**)
  - Edit(PLAN.md)
---

# document-plugin

Produce a single `docs/OVERVIEW.md` that lets a reviewer see — without installing anything — **what
the plugin covers and what each view actually renders**, by pairing authoritative `kubectl` output
with a screenshot of the matching view. This is the **permanent record** that `PLAN.md` is distilled
into (a committed deliverable, not scratch).

## Preconditions

- The plugin is **built and live-verified** (`/run-and-verify`): loads with no `Plugin execution
  error`, every CRD has a list + detail view, the Map shows the grouped node. Document the working
  plugin — don't paper over a broken one.
- **Headlamp is running** with the chrome-devtools MCP attached (screenshots come from the live app).
- The cluster has the **seeded fixtures** applied (`/seed-test-data`) so views are non-empty and the
  Map has real edges.
- Read `PLAN.md` for the full CRD scope (the coverage checklist), routes, and scenario→state matrix.

## Output

```
docs/
  OVERVIEW.md
  img/  list-<kind>.png  detail-<kind>.png  map-filters.png  map-plugin-only.png  map-graph-<kind>.png  settings.png
```
Reference images with **relative** paths (`![…](img/list-….png)`).

## Steps

1. **CRD coverage table** — one row per CRD from `PLAN.md` scope:

   | CRD | Description | Notes | List | Detail |
   |---|---|---|:---:|:---:|
   | `Component` (`dapr.io/v1alpha1`) | Pluggable building-block config | namespaced | ✓ | ✓ |

   Description/Notes from the CRD (`spec.names`, its description/printer columns) + project docs — not
   invented. ✓ where the view exists; a *stated* skip gets `—` + a one-line reason. This column is the
   scope-coverage proof.

2. **Per resource — list view:** paste the **literal `kubectl get <plural> -A -o wide`** output (always
   `-o wide` → the full column set the list mirrors) in a fenced block, then a **list screenshot**
   (`navigate_page` to the list route → `take_screenshot` → `img/list-<kind>.png`) beneath it.

3. **Per resource — detail view:** pick a representative instance (a meaningful state from the matrix):
   - **`kubectl describe <kind> <name> -n <ns>` — the COMPLETE output, verbatim**, pasted whole. Don't
     trim metadata/Labels/Annotations/Events — it's the describe-parity yardstick.
   - **Full-page detail screenshot.** Detail pages overflow the viewport; `fullPage:true` alone clips
     because Headlamp's main area is a fixed-height stack with internal scroll. **Before the shot,
     `evaluate_script` this to unclip the chain, then `take_screenshot` with `fullPage:true`:**
     ```js
     let el = document.querySelector('main');
     while (el && el !== document.documentElement) {
       el.style.height = 'auto'; el.style.maxHeight = 'none'; el.style.overflow = 'visible';
       el = el.parentElement;
     }
     return document.documentElement.scrollHeight;   // should now exceed the viewport
     ```
     Verify the returned height exceeds one viewport; if not, the selector missed the scroll layer —
     re-inspect and walk again. **Do not use `resize_page`** (Electron lacks the Browser CDP domain).

4. **Map (topology) section** — `navigate_page` to the Map, then capture **all three**:
   - **`map-filters.png`** — the Map with the **source-filter / legend visible**, showing the
     plugin's grouped parent node + its per-Kind leaf sources **with their icons** (this screenshot is
     what proves the icons render — the two-surface icon trap from `/add-list-view`).
   - **`map-plugin-only.png`** — **toggle the filter so only the plugin's resources are enabled**
     (disable the built-in / other sources), then screenshot the focused graph.
   - **`map-graph-<kind>.png`** (1–2) — `click` a node that **has edges** (a CR linked to its
     Deployment/Secret/another CR) so its **connected graph** expands, and screenshot what links to
     what. Pick the richest relationship(s) so the topology value is visible.

   Add a sentence per screenshot describing the relationship shown. (If a view overflows the viewport,
   use the unclip-the-chain `evaluate_script` from step 3 before the shot.)

5. **Settings section (only if the plugin has a settings page).** Open Settings → Plugins → your
   plugin, `take_screenshot` → `img/settings.png`, and build a settings table from `PLAN.md` /
   `src/config.ts`:

   | Setting | Scope | Default | Controls |
   |---|---|---|---|
   | Refetch interval | plugin-wide | 5s | how often the lists poll |
   | Metrics URL | per-cluster | — | the Prometheus endpoint for this cluster |

   Note the scope (plugin-wide vs per-cluster) and which views each setting affects. Skip this section
   entirely if the plugin has no settings.

6. **Assemble `OVERVIEW.md`:** title + one-paragraph summary (project, version, cluster, # CRDs) → the
   coverage table → a `## <Kind>` section per CRD (list pair, then detail pair) → `## Map view` →
   `## Settings` (if any) → a short How-to-run/package footer.

## Guardrails

- Screenshots must be the **real running plugin** against seeded data — never mock-ups. If a view
  can't be captured, fix that first (it means it isn't verified).
- `kubectl` output is **literal AND complete** — don't hand-edit values to match the UI or abridge it.
  A genuine mismatch is a finding (a column/section gap), not something to smooth over.
- Factual, concise prose — a coverage report, not marketing.
