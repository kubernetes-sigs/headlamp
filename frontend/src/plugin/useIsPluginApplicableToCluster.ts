/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useMemo } from 'react';
import { useSelectedClusters } from '../lib/k8s';
import { useTypedSelector } from '../redux/hooks';
import { matchesClusterSelector } from './clusterSelector';

type ClusterLabels = Record<string, string> | undefined;
type LabeledClusterConfig = {
  meta_data?: { clusterInventory?: { labels?: Record<string, string> } };
};

/**
 * Reads Cluster Inventory labels for every currently *selected* cluster (plural: an
 * aggregate/multi-cluster URL like `/c/a+b/...` can have more than one).
 *
 * Reads `state.config.clusters`/`statelessClusters` directly rather than going through
 * `useClustersConf()`, which memoizes its return value only on the set of cluster-name
 * keys (see `lib/k8s/index.ts`). A ClusterProfile's labels can change without any cluster
 * being added or removed — Layout.tsx polls and dispatches fresh config on an interval —
 * so that memo would keep returning the old labels for an existing cluster until some
 * unrelated change (or a reload) happened to bust it. Selecting the raw slices here
 * instead means this hook naturally re-renders whenever Redux actually gets new data for
 * a selected cluster.
 *
 * `allClusters` is deliberately not consulted: nothing in the app ever dispatches into it
 * (only `setConfig`/`setStatelessConfig` exist, writing `clusters`/`statelessClusters`
 * respectively), so it is always empty in practice.
 *
 * Only clusters discovered via Cluster Inventory (ClusterProfile CRDs) carry labels
 * today — manually-added kubeconfig clusters have no ClusterProfile to source them from,
 * so this returns `undefined` for those, which `matchesClusterSelector` treats
 * permissively (always matches).
 */
function useSelectedClusterLabelSets(): ClusterLabels[] {
  const selectedClusters = useSelectedClusters();
  const clusters = useTypedSelector(state => state.config.clusters);
  const statelessClusters = useTypedSelector(state => state.config.statelessClusters);

  return useMemo(
    () =>
      selectedClusters.map(clusterName => {
        const clusterConf = (statelessClusters?.[clusterName] ?? clusters?.[clusterName]) as
          | LabeledClusterConfig
          | undefined;

        return clusterConf?.meta_data?.clusterInventory?.labels;
      }),
    // selectedClusters is re-derived (and can get a new array identity) on every render
    // that doesn't actually change which clusters are selected; join() keeps the memo
    // keyed on the clusters themselves rather than that array's identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClusters.join(','), clusters, statelessClusters]
  );
}

/**
 * Computes, for every known plugin, whether it applies to the currently selected
 * cluster(s).
 *
 * Reads all plugin `clusterSelector`s and the selected clusters' labels once, rather than
 * once per contribution — sidebar entries, routes, appbar actions, and table column
 * processors are rendered from arrays, and React hooks can't be called per-item inside a
 * loop. Consumption points should use this (or {@link useIsPluginApplicableToCluster} for
 * a single plugin) instead of evaluating `clusterSelector` themselves.
 *
 * Multi-cluster (aggregate) pages use union semantics: a plugin applies if its selector
 * matches *any* selected cluster. This matches the rest of the feature's permissive
 * defaults (no selector, or an unlabeled cluster, both always match) — an aggregate view
 * mixing matching and non-matching clusters still shows the plugin, rather than requiring
 * every selected cluster to match and surprising a plugin author whose selector matches
 * the cluster they actually care about. The tradeoff: on an aggregate page, a table
 * column processor gated to cluster A still runs over the whole table, including rows
 * from non-matching cluster B — union chooses to show potentially-irrelevant processing
 * over hiding a plugin the user does want on the page.
 *
 * @returns A map of plugin name to whether it applies to the selected cluster(s). A
 *          plugin absent from the map (e.g. an unattributed contribution's `null` plugin
 *          name) should be treated as applicable — see {@link useIsPluginApplicableToCluster}.
 */
export function usePluginApplicabilityMap(): Map<string, boolean> {
  // Optional chaining: some test and Storybook stores preload only the slices a given
  // story touches, so `plugins`/`pluginSettings` may be absent there even though the real
  // app store always has them (see pluginsSlice's initialState). Left as `undefined`
  // (rather than defaulted here) to keep this selector's return value referentially
  // stable across renders; the fallback is applied inside the memo below instead.
  const pluginSettings = useTypedSelector(state => state.plugins?.pluginSettings);
  const labelSets = useSelectedClusterLabelSets();

  return useMemo(() => {
    const map = new Map<string, boolean>();
    for (const plugin of pluginSettings ?? []) {
      // pluginSettings can hold multiple entries for the same name (dev/user/shipped
      // variants) once applyPluginPriority runs; only the one it picked (isLoaded !==
      // false) actually executes, so an overridden variant's clusterSelector must not
      // overwrite the loaded one's entry in the map.
      if (plugin.isLoaded === false) {
        continue;
      }

      const selector = plugin.headlamp?.clusterSelector;
      // No selected cluster at all (e.g. a cluster-agnostic page): fall through to
      // matchesClusterSelector's own no-labels permissive default, same as any other
      // "we don't know this cluster's labels" case.
      const applies =
        labelSets.length === 0
          ? matchesClusterSelector(selector, undefined)
          : labelSets.some(labels => matchesClusterSelector(selector, labels));

      map.set(plugin.name, applies);
    }
    return map;
  }, [pluginSettings, labelSets]);
}

/**
 * Whether a plugin's UI contributions should be shown on the active cluster, given a
 * `usePluginApplicabilityMap()` result.
 *
 * Plain function (not a hook) so it's safe to call once per item inside `.filter()`/
 * `.map()` over a list of contributions (sidebar entries, routes, appbar actions, table
 * column processors) — computing the applicability map is the hook call, done once per
 * render; checking an individual contribution against it is not.
 *
 * Returns `true` (show it) when:
 * - `pluginName` is `null`/`undefined` — an unattributed contribution (e.g. registered
 *   outside a plugin's synchronous load, or by the deprecated `Registry` class) is shown
 *   rather than hidden, since there is no plugin config to gate it by.
 * - The plugin has no `clusterSelector`, or the active cluster has no labels available —
 *   see {@link matchesClusterSelector} for the exact permissive rules.
 * - `pluginName` doesn't match any known plugin (defensive default).
 *
 * @param applicabilityMap - Result of {@link usePluginApplicabilityMap}.
 * @param pluginName - The contribution's `plugin` field.
 */
export function isPluginApplicable(
  applicabilityMap: Map<string, boolean>,
  pluginName: string | null | undefined
): boolean {
  if (!pluginName) {
    return true;
  }

  return applicabilityMap.get(pluginName) ?? true;
}

/**
 * Whether a single, statically-known plugin's UI contributions should be shown on the
 * active cluster, per its `headlamp.clusterSelector` manifest field.
 *
 * For a contribution list rendered in a loop, use {@link usePluginApplicabilityMap} +
 * {@link isPluginApplicable} instead — calling this hook once per item in a loop would
 * violate the rules of hooks (and needlessly recompute the map each time).
 *
 * @param pluginName - The plugin's package name, or `null`/`undefined`.
 */
export function useIsPluginApplicableToCluster(pluginName: string | null | undefined): boolean {
  const applicabilityMap = usePluginApplicabilityMap();

  return isPluginApplicable(applicabilityMap, pluginName);
}
