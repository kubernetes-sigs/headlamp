---
name: add-list-view
description: Add a CRD's resource-view backbone to this plugin — the list page (ResourceListView with kubectl-matching columns), the list+detail routes and sidebar entry, the shared not-installed banner, and the Map (topology) source. Consumes the typed class from /define-resource. Works standalone (add a new CRD's view to an existing plugin) or as a build step after /plan-plugin. Pairs with /add-detail-view for the detail page.
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

# add-list-view

Builds the **backbone** for one CRD: its typed class, list page, routes, the not-installed gate, and
its Map source. The detail page itself is `/add-detail-view`. Model everything from the **live
cluster**, never guessed shapes. If a `PLAN.md` exists, take the column set / grouping from it.

## Prerequisite — the typed resource class

This view consumes the typed `src/resources/<name>.ts` class (`extends KubeObject<Interface>` +
typed getters). **Create it first with `/define-resource`** — the examples below use its `Widget`
class (`widget.size`, `widget.readyStatus`, …). If it doesn't exist yet, stop and run
`/define-resource` for this CRD, then come back.

## 1) List page — `src/components/<resource>/List.tsx`

Use **`ResourceListView`** (full page: title + filter header + table; auto-fetches via
`resourceClass`). **Columns are curated for value** (planned in `/plan-plugin` §3), not a mechanical
copy of kubectl's printer columns: keep the `kubectl get` defaults visible (the floor an operator
expects), **promote** high-value wide/`additionalPrinterColumns`/schema fields to visible (status,
target, key counts), **hide** low-value extras with `show: false` (toggleable), and **add** valuable
`spec`/`status` columns that no printer column exposes. Every column's *value* is sourced from a real
field — never a fabricated value.

```tsx
import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import { ResourceListView } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Widget } from '../../resources/widget';
import { CrdInstalledGate } from '../common/NotInstalled';
import { ReadyStatusLabel } from '../common/ReadyStatusLabel';   // shared status wrapper (see below)

export function WidgetList() {
  const { t } = useTranslation();
  return (
    <CrdInstalledGate crd="widgets.example.com">           {/* install banner on clusters without the CRD */}
      <ResourceListView
        title={t('Widgets')}                               // prose → t()
        id="my-plugin-widgets"                             // plugin-prefixed table id
        resourceClass={Widget}                             // typed item in getters below
        columns={[
          'name', 'namespace',                             // built-in ColumnType strings
          { id: 'size', label: 'Size', getValue: i => i.size },          // labels: plain English (CLAUDE.md)
          { id: 'ready', label: 'Ready',
            getValue: i => i.readyStatus,                                 // raw string → sort / filter / export
            render: i => <ReadyStatusLabel status={i.readyStatus} reason={i.readyReason} message={i.readyMessage} /> },
          'age',
          { id: 'target', label: 'Target', getValue: i => i.spec.target.name, show: false }, // -o wide extra
        ]}
      />
    </CrdInstalledGate>
  );
}
```

`columns` accept built-in `ColumnType` (`'name'`,`'namespace'`,`'age'`,`'kind'`,`'type'`,`'labels'`)
plus custom `{ id, label, getValue, render?, show? }`. For non-resource tabular data use `Table`
(material-react-table), not `ResourceListView`.

> **Multi-cluster is automatic for lists** — `ResourceListView`/`useList` follow the active cluster
> group and auto-add a `'cluster'` column when more than one is selected. Don't hand-roll
> cluster-spanning logic for the list.

**Status/health rendering (contextual):**
- **Condition-backed status** (carries a `reason`/`message`) → a small shared wrapper
  `src/components/common/ReadyStatusLabel.tsx`: `StatusLabel` (severity color + text) **inside a
  `LightTooltip`** that shows the reason/message — so an operator sees *why* it's failing on hover
  (knative/kubeflow pattern). Reused identically by list columns and detail.
- **Simple enum/phase status** (no reason/message) → a bare
  `<StatusLabel status={severity(phase)}>{phase}</StatusLabel>` is fine.
- Either way, a status column provides **both** `render` (the chip) **and** `getValue` (the raw
  string, so sort/filter/export work). Keep one **status→severity** mapper near the typed class /
  `common.ts` so list and detail agree.

```tsx
// src/components/common/ReadyStatusLabel.tsx — condition-backed status with reason/message tooltip
import { LightTooltip, StatusLabel } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { useTranslation } from '@kinvolk/headlamp-plugin/lib';
import Box from '@mui/material/Box';

export function ReadyStatusLabel({ status, reason, message }: { status: string; reason?: string; message?: string }) {
  const { t } = useTranslation();
  const sev = status === 'True' ? 'success' : status === 'False' ? 'error' : 'warning';
  const label = status === 'True' ? t('Ready') : status === 'False' ? t('Not Ready') : t('Unknown');
  const tip = [reason && `${t('Reason')}: ${reason}`, message && `${t('Message')}: ${message}`].filter(Boolean).join('\n');
  const chip = <StatusLabel status={sev}>{label}</StatusLabel>;
  return tip ? <LightTooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tip}</span>}><Box display="inline">{chip}</Box></LightTooltip> : chip;
}
```

## 2) Routes + sidebar — `src/index.tsx` (registration only)

**⚠ Namespace EVERYTHING you register under the project name.** Route `path`s, route `name`s, and
sidebar entry `name`s all live in a **single global namespace shared with Headlamp core and every
other installed plugin** — an unprefixed `/workloads` path or a `name: 'workloads'` sidebar entry
*will* collide (silently shadowing core/another plugin, or being shadowed). So:
- route `path` → **`/<project>/…`** (e.g. `/my-plugin/widgets`)
- sidebar entry `name` and route `name` → **`<project>-…`** (e.g. `my-plugin-widgets`, `my-plugin-widget`)
- table `id` → already `<project>-…` (§1). Use `package.json` `name` as the `<project>` token.

**Multi-CRD plugins: drive registration from a config array + a `registerResource()` loop** (the
keda/cluster-api/kubeflow pattern) — DRY, consistent, and prefixes everything in one place:

```tsx
const PROJECT = 'my-plugin';   // === package.json name
const RESOURCES = [
  { name: 'Widgets', plural: 'widgets', List: WidgetList, Detail: WidgetDetail, namespaced: true },
  // …one entry per CRD…
];
function registerResource(c) {
  const entry = `${PROJECT}-${c.plural}`;          // global-unique sidebar/route id (prefixed)
  registerSidebarEntry({ parent: PROJECT, name: entry, label: c.name, url: `/${PROJECT}/${c.plural}` });
  registerRoute({ path: `/${PROJECT}/${c.plural}`, sidebar: entry, exact: true, component: c.List });
  registerRoute({
    path: `/${PROJECT}/${c.namespaced ? ':namespace/' : ''}${c.plural}/:name`,
    sidebar: entry, name: `${PROJECT}-${c.plural.slice(0, -1)}`, component: c.Detail,  // prefixed route name
  });
}
registerSidebarEntry({ name: PROJECT, label: 'My Plugin', url: `/${PROJECT}/${RESOURCES[0].plural}` }); // parent (name IS the project → unique)
RESOURCES.forEach(registerResource);
```

A **single-resource** plugin can inline the two `registerRoute` + one `registerSidebarEntry` calls —
still prefixed. **Sidebar landing:** the parent entry carries its own `url`; for a *small* plugin point
it at the primary list, for a *many-CRD* plugin at a dedicated **Overview** page (see `/plan-plugin`
§Navigation). Sidebar/route labels are module-scope, so keep them plain English (the `t()` hook can't
run there). A Name column links to the detail via the **prefixed** route `name`:

```tsx
{ id: 'name', label: 'Name', getValue: w => w.metadata.name,
  render: w => <Link routeName="my-plugin-widget" params={{ namespace: w.metadata.namespace, name: w.metadata.name }}>{w.metadata.name}</Link> }
```
Route `path`s omit `/c/<cluster>`; URLs you *construct* include it (`getCluster()`).

## 3) Map (topology) source — `src/mapView.tsx`

CRDs belong in the Map, **grouped under ONE project parent** (don't scatter N top-level entries).
One leaf `GraphSource` per CRD → one parent → `registerMapSource(parent)` once.

```tsx
import { Icon } from '@iconify/react';
import { registerKindIcon, registerMapSource } from '@kinvolk/headlamp-plugin/lib';
import { useMemo } from 'react';
import { Widget } from './resources/widget';
import { WidgetDetail } from './components/widgets/Detail';

// Every CNCF plugin defines this edge helper locally (no shared lib helper):
const makeKubeToKubeEdge = (from: any, to: any, opts: any = {}) => ({
  id: `${from.metadata.uid}-${to.metadata.uid}`, source: from.metadata.uid, target: to.metadata.uid, ...opts,
});

const widgetSource = {
  id: 'my-plugin-widgets', label: 'Widgets',
  icon: <Icon icon="mdi:widgets" width="100%" height="100%" />,   // REQUIRED — see the icon trap
  useData() {
    const [widgets] = Widget.useList();
    return useMemo(() => {
      if (!widgets) return null;
      const nodes = widgets.map(w => ({
        id: w.metadata.uid,          // node id = the object's uid (always)
        kubeObject: w,
        weight: 1000,                // optional: higher = laid out closer to the root
        detailsComponent: ({ node }) => <WidgetDetail name={node.kubeObject.metadata.name} namespace={node.kubeObject.metadata.namespace} />,
      }));
      const edges = []; // for each CR, push makeKubeToKubeEdge(w, relatedObject) to link it to its Deployment/Secret/…
      return { nodes, edges };
    }, [widgets]);
  },
};
export const myPluginSource = {                                   // ONE parent groups every leaf
  id: 'my-plugin', label: 'My Plugin',
  icon: <Icon icon="mdi:widgets" width="100%" height="100%" />,
  sources: [widgetSource /*, … */],
};
// index.tsx:
registerMapSource(myPluginSource);                               // ONE call
registerKindIcon('Widget', { icon: <Icon icon="mdi:widgets" width="70%" height="70%" />, color: 'rgb(50,108,229)' });
```

**The icon trap — two independent surfaces, both silent:** `GraphSource.icon` (on **every** leaf
*and* the parent) icons the **Map source-filter/legend**; `registerKindIcon` icons the graph
**nodes**. Doing only `registerKindIcon` leaves filter rows blank. And every `icon` must be a
**rendered element** (`<Icon icon="mdi:…" />`), never the bare `'mdi:…'` string — `icon` is typed
`ReactNode` *and optional*, so tsc catches neither a missing icon nor a string (it renders as
literal text). Only the live Map view proves icons render.

## 4) Gate + verify (live load is non-skippable)

`npm run tsc && npm run lint && npm run build`, then `/run-and-verify`: the console has **no
`Plugin execution error`**, the sidebar entry/route/list renders (`take_snapshot`), the Name link
opens the detail, the CRs show in the **Map with real icons** on both filter rows and nodes. A
value-import/`extends` mistake passes the build but crashes at load — only this catches it. Then
build the detail page with **`/add-detail-view`**.

## Reference: the not-installed gate — `src/components/common/NotInstalled.tsx`

One reusable wrapper for every List and Detail. Detects CRD **presence** (so *installed-but-empty*
still shows the normal empty state) and, when absent, shows a banner with a docs link.

```tsx
import { Icon } from '@iconify/react';
import { K8s, useTranslation } from '@kinvolk/headlamp-plugin/lib';
import { Loader, SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import { PROJECT } from '../../resources/common'; // { name, docsUrl, installCmd }

const CRD = K8s.ResourceClasses.CustomResourceDefinition;

export function useCrdInstalled(crdName: string): 'loading' | 'present' | 'absent' {
  const [crd, error] = CRD.useGet(crdName);                 // crdName = '<plural>.<group>'
  if (error) return 'absent';                               // cluster-api style: any get error ⇒ not-installed
  return crd ? 'present' : 'loading';                       // distinguishes not-installed from installed-but-empty
}

export function CrdInstalledGate({ crd, children }: { crd: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const state = useCrdInstalled(crd);
  if (state === 'loading') return <Loader title={t('Loading…')} />;
  if (state === 'present') return <>{children}</>;
  return (
    <SectionBox title={PROJECT.name}>
      <Alert severity="info" icon={<Icon icon="mdi:information-outline" />}>
        <AlertTitle>{t('{{project}} is not installed in this cluster', { project: PROJECT.name })}</AlertTitle>
        {t('This view needs the {{crd}} CRD, which is absent on the selected cluster. Install {{project}}, then reload.', { crd, project: PROJECT.name })}
        {PROJECT.installCmd && (
          <Box component="pre" sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1, overflowX: 'auto' }}>{PROJECT.installCmd}</Box>
        )}
        <Box sx={{ mt: 1 }}>
          <Button variant="outlined" component="a" href={PROJECT.docsUrl} target="_blank" rel="noopener noreferrer"
            endIcon={<Icon icon="mdi:open-in-new" />}>{t('Installation guide')}</Button>
        </Box>
      </Alert>
    </SectionBox>
  );
}
```

Wrap **both** List and Detail bodies in `<CrdInstalledGate crd="…">` (this is the same
`CustomResourceDefinition.useGet` detection cluster-api uses). Verify the banner by loading on a
cluster **without** the CRD.

**North star:** KEDA — https://github.com/headlamp-k8s/plugins/tree/main/keda (`src/resources/*.ts`,
`src/components/<resource>/List.tsx`, the `kedaSource` Map parent).
