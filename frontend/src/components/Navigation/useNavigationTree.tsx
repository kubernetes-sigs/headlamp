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

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getClusterAppearanceFromMeta } from '../../helpers/clusterAppearance';
import { isElectron } from '../../helpers/isElectron';
import { useSelectedClusters } from '../../lib/k8s';
import { apiDiscovery } from '../../lib/k8s/api/v2/apiDiscovery';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import CRD from '../../lib/k8s/crd';
import { ResourceCategory } from '../../lib/k8s/ResourceCategory';
import { groupByCategory } from '../../lib/k8s/ResourceCategory';
import { createRouteURL } from '../../lib/router/createRouteURL';
import { useTypedSelector } from '../../redux/hooks';
import ClusterBadge from '../Sidebar/ClusterBadge';
import { DefaultSidebars, SidebarEntry } from '../Sidebar/sidebarSlice';
import { buildNavigationTree, NavItem, NavNode } from './navigationUtils';

const emptyMap = new Map<ResourceCategory, ApiResource[]>();

export function useNavigationTree(sidebarName: string = DefaultSidebars.IN_CLUSTER): {
  nodes: NavNode[];
  isLoading: boolean;
} {
  const selectedClusters = useSelectedClusters();
  const clusters = useTypedSelector(state => state.config.clusters) ?? {};
  const customSidebarEntries = useTypedSelector(state => state.sidebar.entries);
  const customSidebarFilters = useTypedSelector(state => state.sidebar.filters);
  const { t } = useTranslation();

  const selectedClustersJoined = selectedClusters.join(',');
  const shouldShowHomeItem = isElectron() || Object.keys(clusters).length !== 1;
  const isInCluster = sidebarName === DefaultSidebars.IN_CLUSTER;

  const { data: resources, isLoading: isLoadingResources } = useQuery({
    queryFn: () => apiDiscovery([...selectedClusters]),
    queryKey: ['api-discovery', ...selectedClusters],
    enabled: isInCluster && selectedClusters.length > 0,
  });

  const [crds] = CRD.useList(
    isInCluster && selectedClusters.length > 0 ? { clusters: selectedClusters } : { clusters: [] }
  );
  const crdNames = useMemo(() => {
    if (!isInCluster || !crds) return undefined;
    return new Set(crds.map(crd => crd.metadata.name));
  }, [isInCluster, crds]);

  const isLoading = isInCluster && (isLoadingResources || !crds);

  const categories = useMemo(() => {
    if (!isInCluster || !resources) return emptyMap;
    return groupByCategory(resources, crdNames);
  }, [isInCluster, resources, crdNames]);

  const staticItems = useMemo(() => {
    if (sidebarName === DefaultSidebars.HOME) {
      return buildHomeItems(shouldShowHomeItem, clusters, t);
    }
    if (isInCluster) {
      return buildInClusterStaticItems(shouldShowHomeItem, selectedClusters, t);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarName, shouldShowHomeItem, Object.keys(clusters).join(','), selectedClustersJoined, t]);

  const { pluginItems, mergedStaticItems } = useMemo(() => {
    const entries = Object.values(customSidebarEntries);
    const targetSidebar = sidebarName === '' ? DefaultSidebars.IN_CLUSTER : sidebarName;

    const topLevel: NavItem[] = [];
    const withParent: SidebarEntry[] = [];

    for (const entry of entries) {
      if (entry.parent) {
        withParent.push(entry);
      } else {
        const sidebar = entry.sidebar ?? DefaultSidebars.IN_CLUSTER;
        if (sidebar === targetSidebar) {
          topLevel.push(entryToNavItem(entry));
        }
      }
    }

    // Attach children to their parents (search in both staticItems and topLevel).
    // We shallow-clone parents before mutating so we don't modify the source arrays.
    const mergedStatic = [...staticItems];
    const lookup = new Map<string, NavItem>();
    const buildLookup = (items: NavItem[]) => {
      for (const item of items) {
        lookup.set(item.name, item);
        if (item.subList) buildLookup(item.subList);
      }
    };
    buildLookup([...mergedStatic, ...topLevel]);

    for (const entry of withParent) {
      const original = lookup.get(entry.parent!);
      if (!original) continue;
      const parent = { ...original, subList: [...(original.subList ?? [])] };
      lookup.set(parent.name, parent);
      parent.subList.push(entryToNavItem(entry));

      // Replace in topLevel or staticItems, whichever contains the parent
      const topIdx = topLevel.indexOf(original);
      if (topIdx >= 0) {
        topLevel[topIdx] = parent;
      } else {
        const staticIdx = mergedStatic.indexOf(original);
        if (staticIdx >= 0) mergedStatic[staticIdx] = parent;
      }
    }

    return { pluginItems: topLevel, mergedStaticItems: mergedStatic };
  }, [customSidebarEntries, sidebarName, staticItems]);

  // Apply sidebar filters
  const applyFilters = useMemo(() => {
    if (customSidebarFilters.length === 0 || !isInCluster) return (items: NavItem[]) => items;
    return (items: NavItem[]) => {
      let result = [...items];
      for (const filter of customSidebarFilters) {
        result = filterItems(result, filter);
      }
      return result;
    };
  }, [customSidebarFilters, isInCluster]);

  const filteredStaticItems = useMemo(() => applyFilters(mergedStaticItems), [applyFilters, mergedStaticItems]);
  const filteredPluginItems = useMemo(() => applyFilters(pluginItems), [applyFilters, pluginItems]);

  const nodes = useMemo(
    () =>
      buildNavigationTree(categories, filteredStaticItems, filteredPluginItems, selectedClusters, {
        includeInClusterCategories: isInCluster && !isLoading,
      }),
    [categories, filteredStaticItems, filteredPluginItems, selectedClusters, isInCluster, isLoading]
  );

  return { nodes, isLoading };
}

function entryToNavItem(entry: SidebarEntry): NavItem {
  return {
    name: entry.name,
    label: entry.label,
    icon: typeof entry.icon === 'string' ? entry.icon : undefined,
    url: entry.url ?? '',
    useClusterURL: entry.useClusterURL,
  };
}

function filterItems(
  items: NavItem[],
  filter: (entry: SidebarEntry) => SidebarEntry | null
): NavItem[] {
  return items
    .filter(item => filter(item as unknown as SidebarEntry) !== null)
    .map(item => ({
      ...item,
      subList: item.subList ? filterItems(item.subList, filter) : undefined,
    }));
}

function buildHomeItems(
  shouldShowHomeItem: boolean,
  clusters: Record<string, any>,
  t: (key: string) => string
): NavItem[] {
  return [
    {
      name: 'home',
      icon: shouldShowHomeItem ? 'mdi:home' : 'mdi:hexagon-multiple-outline',
      label: shouldShowHomeItem ? t('translation|Home') : t('glossary|Cluster'),
      url: shouldShowHomeItem
        ? '/'
        : createRouteURL('cluster', { cluster: Object.keys(clusters)[0] }),
    },
    {
      name: 'notifications',
      icon: 'mdi:bell',
      label: t('translation|Notifications'),
      url: '/notifications',
    },
    {
      name: 'settings',
      icon: 'mdi:cog',
      label: t('translation|Settings'),
      url: '/settings/general',
      subList: [
        {
          name: 'settingsGeneral',
          label: t('translation|General'),
          url: '/settings/general',
        },
        {
          name: 'plugins',
          label: t('translation|Plugins'),
          url: '/settings/plugins',
        },
        {
          name: 'settingsCluster',
          label: t('glossary|Cluster'),
          url: '/settings/cluster',
        },
      ],
    },
  ];
}

function buildInClusterStaticItems(
  shouldShowHomeItem: boolean,
  selectedClusters: string[],
  t: (key: string) => string
): NavItem[] {
  const clusterBadgesSubtitle =
    selectedClusters.length > 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
        {selectedClusters.map(clusterName => {
          const appearance = getClusterAppearanceFromMeta(clusterName);
          return (
            <ClusterBadge
              key={clusterName}
              name={clusterName}
              accentColor={appearance.accentColor || undefined}
              icon={appearance.icon}
            />
          );
        })}
      </div>
    ) : undefined;

  return [
    {
      name: 'home',
      icon: 'mdi:home',
      label: t('translation|Home'),
      url: '/',
      hide: !shouldShowHomeItem,
    },
    {
      name: 'cluster',
      icon: 'mdi:hexagon-multiple-outline',
      label: selectedClusters.length > 1 ? t('Clusters') : t('glossary|Cluster'),
      subtitle: clusterBadgesSubtitle,
      url: createRouteURL('cluster') || '/',
      subList: [
        {
          name: 'namespaces',
          label: t('glossary|Namespaces'),
          url: createRouteURL('namespaces') || '/namespaces',
        },
        {
          name: 'nodes',
          label: t('glossary|Nodes'),
          url: createRouteURL('nodes') || '/nodes',
        },
        {
          name: 'advancedSearch',
          label: t('Advanced Search (Beta)'),
          url: createRouteURL('advancedSearch') || '/advanced-search',
        },
      ],
    },
    {
      name: 'map',
      icon: 'mdi:map',
      label: t('glossary|Map'),
      url: createRouteURL('map') || '/map',
    },
  ];
}
