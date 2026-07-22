---
name: add-settings
description: Add a settings page to this plugin backed by ConfigStore — a typed src/config.ts module, a settings UI registered with registerPluginSettings, and reactive reads of the saved config in components. Settings can be plugin-wide or per-cluster. Use when the plugin needs user-configurable, persisted options (refetch interval, feature toggles, default namespace, …). Build it BEFORE any view that reads a setting — the config module is their dependency. Works standalone.
allowed-tools:
  - Write(src/**)
  - Edit(src/**)
  - Edit(PLAN.md)
  - Bash(npm run tsc:*)
  - Bash(npm run lint:*)
  - Bash(npm run lint-fix:*)
  - Bash(npm run build:*)
---

# add-settings

A Settings page (under Headlamp Settings → Plugins) whose values persist and can be read reactively.
The store is `ConfigStore` — typed, persisted to browser local storage, **per browser profile (not
synced)**. The store key and the `registerPluginSettings` name **must equal `package.json` `name`**.

**Build order:** if any view reads a setting, build this `src/config.ts` module **before** those
views (it's their dependency) — `/plan-plugin` records which views consume which settings.

## 1) Typed config — `src/config.ts`

```ts
import { ConfigStore } from '@kinvolk/headlamp-plugin/lib';

export interface MyPluginConfig { showDetails: boolean }
export const DEFAULT_CONFIG: MyPluginConfig = { showDetails: true };

export const store = new ConfigStore<MyPluginConfig>('my-plugin');   // key === package.json name

export function getConfig(): MyPluginConfig {
  return { ...DEFAULT_CONFIG, ...store.get() };                      // get() is undefined before first save
}
```

## Scope — plugin-wide vs per-cluster

The example above is **plugin-wide**: one flat object, the same on every cluster. When a setting must
differ per cluster (a cluster-specific metrics URL, a per-cluster default namespace), make it
**per-cluster** by keying the config by cluster name and reading the current cluster's slice with
`getCluster()`:

```ts
import { getCluster } from '@kinvolk/headlamp-plugin/lib/Utils';

export interface PerClusterConfig { metricsUrl?: string; defaultNamespace?: string }
export interface MyPluginConfig {
  showDetails: boolean;                          // plugin-wide
  clusters: Record<string, PerClusterConfig>;    // per-cluster, keyed by cluster name
}
export const DEFAULT_CONFIG: MyPluginConfig = { showDetails: true, clusters: {} };
export const DEFAULT_PER_CLUSTER: PerClusterConfig = { defaultNamespace: 'default' };

// read the current cluster's slice (merged with defaults):
export function getClusterConfig(): PerClusterConfig {
  const cluster = getCluster() ?? '';
  return { ...DEFAULT_PER_CLUSTER, ...getConfig().clusters[cluster] };
}
```

In the settings UI, let the user pick a cluster (`K8s.useClustersConf()`) and edit that cluster's
slice; write back with `store.update({ clusters: { ...cfg.clusters, [cluster]: next } })`. Mixing both
in one config is fine — flat keys for plugin-wide, the `clusters` map for per-cluster. Record each
setting's scope in `PLAN.md`.

## 2) Settings UI — `src/settings.tsx`

`registerPluginSettings(name, Component, true)` injects `data` + `onDataChange` and shows a Save
button (pass `false` to save yourself).

```tsx
import { PluginSettingsDetailsProps, useTranslation } from '@kinvolk/headlamp-plugin/lib';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { DEFAULT_CONFIG } from './config';

export default function Settings({ data, onDataChange }: PluginSettingsDetailsProps) {
  const { t } = useTranslation();
  const config = { ...DEFAULT_CONFIG, ...data };
  return (
    <FormControlLabel label={t('Show details')}
      control={<Switch checked={config.showDetails}
        onChange={e => onDataChange?.({ ...config, showDetails: e.target.checked })} />} />
  );
}
```

## 3) Register — `src/index.tsx`

```ts
import { registerPluginSettings } from '@kinvolk/headlamp-plugin/lib';
import Settings from './settings';
registerPluginSettings('my-plugin', Settings, true);   // name === package.json name
```

## 4) Read the config

- **Reactively** (re-renders on change) — call the hook at the **top level**, before any early return:
  ```tsx
  import { store, DEFAULT_CONFIG } from './config';
  const useConf = store.useConfig();
  const config = { ...DEFAULT_CONFIG, ...useConf() };
  ```
- **Once, outside React:** `getConfig()`. **Write:** `store.set(value)` / `store.update(partial)`.

## Rules / gotchas

- Name + store key **must match `package.json` `name`** (case-sensitive).
- Always spread `{ ...DEFAULT_CONFIG, ...store.get() }` — `get()` is `undefined` before first save.
- `useConfig()` at the top of the component, never after a conditional return (rules of hooks).
- Per-browser local storage — **not synced; don't store secrets**.
- i18n + a11y apply (labels via `t(...)`, proper control labels).

## Gate + verify

`npm run tsc && npm run lint && npm run build`, then `/run-and-verify`: open Settings → Plugins →
your plugin, toggle a value, Save, confirm the dependent UI reacts with no console errors.
