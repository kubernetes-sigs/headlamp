---
name: add-detail-view
description: Build this plugin's own resource detail page with kubectl-describe parity — render every meaningful spec/status field via DetailsGrid (extraInfo + per-group extraSections), a Conditions section placed LAST so it sits directly above the auto Events section, related/owner links, and a read-only Monaco CodeBlock for free-form blobs. Consumes the typed class from /define-resource; pairs with /add-list-view. Works standalone (fix/extend an existing detail page).
allowed-tools:
  - mcp__kubernetes__*
  - Bash(kubectl get:*)
  - Bash(kubectl describe:*)
  - Write(src/**)
  - Edit(src/**)
  - Edit(PLAN.md)
  - Bash(npm run tsc:*)
  - Bash(npm run lint:*)
  - Bash(npm run lint-fix:*)
  - Bash(npm run build:*)
---

# add-detail-view

A list answers "which objects exist"; the **detail page** answers "what is this one object, fully" —
it must be as complete as `kubectl describe <res> <name>`. `DetailsGrid` renders default metadata for
free, but **everything from `spec`/`status` is yours to render**. The classic failure is a page with
two or three hand-picked `extraInfo` rows: it builds green, loads fine, and silently omits most of
the object.

**Prerequisites:** the typed class (`/define-resource`) and the list + `:name` detail route
(`/add-list-view`). Build the detail component in `src/components/<resource>/Detail.tsx`.

## The describe-parity rule

Render every meaningful field, sourced from the real object — not a guessed subset:

1. **Enumerate the shape from the live cluster** — a real instance + the CRD's `openAPIV3Schema`
   (`kubectl explain <res>.spec` / the CRD). That schema *is* the field checklist; cross-check
   `kubectl describe <res> <name>`.
2. **Map each field to a place on the page** (layout below). Deliberately omitting a field (huge
   blobs, internal, redundant) is fine — a decision, not an oversight; note skips in `PLAN.md`.
3. **Read through typed getters** (`obj.componentType`), not `jsonData?.spec?.…?`. If a field needs
   a clean read, add a getter in `/define-resource`'s class.

**Wrap the Detail body in the not-installed gate too** — `<CrdInstalledGate crd="<plural>.<group>">`
(the shared `src/components/common/NotInstalled.tsx` from `/add-list-view`) — a stale deep-link can
hit this page on a cluster without the CRD.

## Page layout (DetailsGrid order is fixed — exploit it)

`DetailsGrid` always renders: **back link → header → main info → `extraSections` → Events** (Events
only with `withEvents`). So:

| Region | What | How |
|---|---|---|
| **Back link** | Returns to the list | **auto-derived** from the resource's list route — **don't pass `backLink`** |
| **Main info** (top) | Identity + headline scalars (type, version, ready, key spec summary) | `extraInfo={item => NameValueTableRow[]}` |
| **Header actions** | **Edit / Delete / Scale / Restart come FREE by default**; only add *project-specific* ones | `actions={…}` (see "Project-specific actions" below) |
| **`extraSections`** (middle) | One `SectionBox` per logical `spec`/`status` group — the bulk of parity | `extraSections={item => DetailsViewSection[]}` |
| **Conditions** | `status.conditions` — **LAST in `extraSections`** | `ConditionsSection` (auto-wraps) |
| **Events** (bottom) | Object events | `withEvents` (auto-rendered after `extraSections`) |

**Back link is free** — DetailsGrid derives it from the resource's list route, so **omit `backLink`**
(passing a bare boolean is a type error; the prop is `string | location | null`).

**Conditions go LAST** so they render directly above the auto Events section — the two
"what's happening now" panels read together, matching the bottom of `kubectl describe`. Use the
higher-level **`ConditionsSection`** (keda's pattern — it wraps the conditions table in its own
section; less boilerplate than a manual `SectionBox` + `ConditionsTable`). (If `status` has no
`conditions`, skip it but surface whatever status signal exists — `phase`/`observedGeneration` — in
main info or a Status section.)

## Putting it together

```tsx
// src/components/components/Detail.tsx  (Dapr Component example)
import { ConditionsSection, DetailsGrid, NameValueTable, SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import { useParams } from 'react-router-dom';
import { Component } from '../../resources/component';
import { CrdInstalledGate } from '../common/NotInstalled';
import { ReadyStatusLabel } from '../common/ReadyStatusLabel';

export function ComponentDetail() {
  const { namespace, name } = useParams<{ namespace: string; name: string }>();
  const { t } = useTranslation();
  return (
    <CrdInstalledGate crd="components.dapr.io">
      <DetailsGrid
        resourceType={Component} name={name} namespace={namespace}
        withEvents                                       {/* Events section at the bottom; backLink omitted → auto-derived */}
        extraInfo={item => [                              // headline scalars (labels = plain English)
          { name: 'Type', value: item.componentType },
          { name: 'Version', value: item.version },
          { name: 'Ready', value: <ReadyStatusLabel status={item.readyStatus} reason={item.readyReason} message={item.readyMessage} /> },
        ]}
        extraSections={item => [                          // the BULK of parity — one section per group
          { id: 'my-plugin-config', section: (
            <SectionBox title={t('Configuration')}>
              <NameValueTable rows={(item.spec?.metadata ?? []).map(m => ({ name: m.name, value: m.value ?? '—' }))} />
            </SectionBox>) },
          // …a section for every meaningful spec/status group…
          { id: 'my-plugin-conditions', section: <ConditionsSection resource={item?.jsonData} /> },  // ← LAST: sits just above Events
        ]}
      />
    </CrdInstalledGate>
  );
}
```

- `extraInfo`/`NameValueTable` `value` can be a React node — render a `<Link>` for an owner ref or a
  referenced Secret/ConfigMap, a status chip, a chip.
- **Status/health scalars use the shared `ReadyStatusLabel`** (condition-backed: severity color +
  reason/message tooltip) — the *same* component the list uses, so both render identically. For a
  simple enum/phase with no reason/message, a bare `<StatusLabel status={severity(phase)}>{phase}</StatusLabel>`
  is fine.
- Nested/list data → `NameValueTable` (key/value) or a small `Table`, in a titled `SectionBox`.
  **Never dump raw JSON as `<pre>`/`JSON.stringify`.** When an array's items each own a *sub-array*,
  don't flatten — nest the table (see "Arrays of grouped objects" below).
- **Owner & related objects → `Link`s** (target Deployment/HPA, Secret, ConfigMap, another CR) —
  the same relationships you draw as Map edges. This makes the page navigable like built-in pages.

## Arrays of grouped objects — nest the table, don't flatten the key

Many CRDs carry a **list whose every item itself owns a sub-list** of structured rows — a parent
that *groups* children. Kueue's `status.flavorsUsage[]` is the canonical case: each flavor has a
`resources[]` array of `{ name, total, borrowed }`. The tempting move is to **flatten** the two
levels into one flat table (one row per flavor × resource). Don't — flattening **repeats the parent
identity on every child row**, so `default-flavor` shows up once per resource and the column reads
like noise (the Kueue "Flavor Usage" / "Flavor Reservation" symptom):

```
Flavor          Resource   Total   Borrowed     ← flattened: parent key repeats, hard to scan
default-flavor  cpu        1       0
default-flavor  memory     256Mi   0
```

**Rule: when an array's items each contain a sub-array, render a two-column outer table — column 1
is the parent's identity, column 2 is a nested table of that parent's children — instead of
flattening the parent key into every child row.** The parent appears exactly once; its children
read as a self-contained block beside it. This is the describe-parity-faithful shape for grouped
data (it mirrors how `kubectl describe` indents a group under its heading), and it scales when a
parent has many children or several would-be-repeated columns.

```
Flavor                                                       ← nested: parent once, children grouped
default-flavor   ┌──────────┬───────┬──────────┐
                 │ Resource │ Total │ Borrowed │
                 ├──────────┼───────┼──────────┤
                 │ cpu      │ 1     │ 0        │
                 │ memory   │ 256Mi │ 0        │
                 └──────────┴───────┴──────────┘
```

### How: a child `SimpleTable` inside the parent column's `getter`

No new component is needed — nest a `SimpleTable` directly inside the section. A `SimpleTable`
column has **no `render` prop**; the `getter`'s return value is rendered straight into the cell, so
it can be any React node — including another `SimpleTable`. So the parent column's `getter` returns
the child table. **What generalizes is this shape, not the labels** — for your resource, swap the
two column headers, the parent's `getter`, the `getChildren` accessor, and the child columns for
your own fields:

```tsx
import { SimpleTable } from '@kinvolk/headlamp-plugin/lib/CommonComponents';

// `groups` is the array whose items each own a sub-array — e.g. Kueue's status.flavorsUsage[].
// Replace the labels / getters / child columns with YOUR resource's fields:
<SimpleTable
  data={groups}
  columns={[
    {
      label: 'Flavor',                               // ← parent column header (your field)
      gridTemplate: 'min-content',                   // keep the parent column narrow…
      cellProps: { sx: { verticalAlign: 'top', whiteSpace: 'nowrap' } }, // …top-aligned with row 1
      getter: g => g.name,                           // parent identity, shown ONCE per group
    },
    {
      label: 'Resources',                            // ← nested column header (your field)
      getter: g => (                                 // getter returns the child table
        <SimpleTable
          data={g.resources ?? []}                   // ← each parent's children (your accessor)
          columns={[                                  // ← child columns (your fields)
            { label: 'Resource', getter: c => c.name },
            { label: 'Total', getter: c => String(c.total ?? '-') },
            { label: 'Borrowed', getter: c => String(c.borrowed ?? '-') },
          ]}
        />
      ),
    },
  ]}
/>
```

Notes:
- `getter` returns the cell node — there is no separate `render`. Use `cellProps` (spread onto the
  MUI `TableCell`) for per-cell styling like `verticalAlign`, and `gridTemplate` to keep the parent
  column narrow so the nested table gets the width.
- **Pick the nested component by the child's shape:**
  - **Child is a *list of records*** (each child has the same handful of fields, and there are
    several) → nest a **`SimpleTable`** (columns = fields, rows = children), as above. This is the
    "list of lists" case — Kueue's flavor → `resources[]`.
  - **Child is a *single object*** (one record's named key/value attributes, not a repeated row) →
    nest a **`NameValueTable`** instead — a one-row `SimpleTable` is the wrong shape for "this
    object's fields". Same parent column, just swap the `getter`'s return:
    ```tsx
    import { NameValueTable } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
    // parent column 2:
    getter: g => (
      <NameValueTable rows={[
        { name: 'Type', value: g.config.type },
        { name: 'Path', value: g.config.path ?? '—' },
        { name: 'Read only', value: String(g.config.readOnly ?? false) },
      ]} />
    ),
    ```
- Use this only for genuine parent→children grouping. A flat list of scalar rows stays a flat
  `NameValueTable`/`SimpleTable`; don't nest a table that has nothing to group.
- **Don't reach for a generic wrapper component** ("GroupedTable" etc.) — the inline nested
  `SimpleTable` is easier to read and is the whole pattern. Only if *one plugin* repeats this for
  several fields and the duplication actually bothers you, extract a tiny local helper in that
  plugin's `src/components/common/`; it's never required by this skill. (Kueue does this once as
  `FlavorUsageTable`/`QuotaTable` — but each is just the inline pattern above.)

## Raw YAML — the whole object is FREE; inline `CodeBlock` only for a specific field

**Whole-object YAML/edit is already there** — DetailsGrid's default `EditButton` (see header actions)
opens the object's YAML editor. **Don't hand-roll a "View YAML" button** for the whole object; just
don't set `noDefaultActions` (set it only when you deliberately want a read-only page).

Use an inline **read-only Monaco `CodeBlock`** only for a **specific free-form field** that's part of
the object and worth showing *in context* — an embedded YAML/template (e.g. Tinkerbell
`Template.spec.data`), a script, an inline manifest, a Helm `values` blob, a PEM/cert. Wrap it once as
`src/components/common/CodeBlock.tsx`. Monaco is externalized (`@monaco-editor/react` →
`pluginLib.ReactMonacoEditor`), so the value import is runtime-safe.

```tsx
// src/components/common/CodeBlock.tsx
import { Editor } from '@monaco-editor/react';                  // → pluginLib.ReactMonacoEditor (runtime-safe)
import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import { CopyButton } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

export default function CodeBlock({ value, language = 'plaintext', ariaLabel, height }:
  { value: string; language?: string; ariaLabel?: string; height?: number | string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const lines = value ? value.split('\n').length : 1;
  const computed = height ?? Math.min(Math.max(lines, 3), 30) * 19 + 16;
  return (
    <Box sx={{ position: 'relative', border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}><CopyButton text={value} /></Box>
      <Editor value={value} language={language} height={computed}
        theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
        wrapperProps={{ 'aria-label': ariaLabel ?? t('Code'), role: 'group' }}
        options={{ readOnly: true, domReadOnly: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
          wordWrap: 'on', fontSize: 12, lineNumbers: 'on', renderLineHighlight: 'none' }} />
    </Box>
  );
}
```

Use it as `<SectionBox title={t('Definition')}><CodeBlock value={item.data} language="yaml" ariaLabel={t('Template definition')} /></SectionBox>`. Structured data still uses `NameValueTable`/`Table`. Monaco
only proves out at runtime — verify on the live load.

## Project-specific actions (mutations beyond the free defaults)

Edit / Delete / Scale / Restart are added by DetailsGrid **for free**. Add a custom header action
only for a **project-specific operation** that `/plan-plugin` decided this CRD needs (flux
suspend/resume, keda pause, a "trigger reconcile") — those are context-dependent, so the plan names
them per CRD. A custom action is a **confirm-gated** header action that mutates via
`ApiProxy.request` (the only write path — the cluster MCP is read-only):

```tsx
import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import { ActionButton } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
// in <DetailsGrid actions={item => [ ... ]} >:
<ActionButton
  description={t('Suspend')} icon="mdi:pause-circle"
  // confirm before mutating (use the lib's ConfirmDialog / ActionButton confirm), then:
  onClick={() => ApiProxy.request(
    `/apis/dapr.io/v1alpha1/namespaces/${item.metadata.namespace}/components/${item.metadata.name}`,
    { method: 'PATCH', body: JSON.stringify({ spec: { suspend: true } }),
      headers: { 'Content-Type': 'application/merge-patch+json' } })}
/>
```

Always confirm before a mutation, give the icon an accessible name (`description`), and surface
success/failure via the `Notification` API. (If a plugin grows several of these, factor them into
`src/components/<resource>/actions.tsx`.)

## i18n + a11y, then gate + verify

Wrap **prose** (section titles, descriptions, empty/error text) in `t(...)`; short field/condition
labels stay plain English. Icon-only actions need an accessible name; keep `npm run lint` green.

`npm run tsc && npm run lint && npm run build`, then **`/run-and-verify`**: open a real instance's
detail (click a Name link), confirm **no `Plugin execution error`**, the **spec/status sections are
present and populated** (not metadata + two rows), the **Conditions table renders directly above
Events**, labels show **real text** (not blank — i18n resolution), and compare against
`kubectl describe <res> <name>` — anything material it shows and the page doesn't is a gap (or a
noted skip). Record the rendered section set in `PLAN.md`.

**North star:** KEDA's `src/components/scaledobjects/Detail.tsx`.
