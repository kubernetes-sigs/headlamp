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

import { groupBy } from 'lodash';
import type { ReactNode } from 'react';
import { generatePath } from 'react-router';
import { formatClusterPathParam, getClusterPrefixedPath } from '../../lib/cluster';
import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { customResourcesCategory, ResourceCategory } from '../../lib/k8s/ResourceCategory';
import { createRouteURL } from '../../lib/router/createRouteURL';

/** Navigation item before URL resolution and tree building */
export interface NavItem {
  name: string;
  label: string;
  icon?: string;
  url: string;
  useClusterURL?: boolean;
  subtitle?: ReactNode;
  hide?: boolean;
  subList?: NavItem[];
}

/**
 * A lightweight node in the navigation tree.
 * Represents a navigable item with optional nested children.
 */
export interface NavNode {
  label: string;
  url: string;
  icon?: string;
  subtitle?: ReactNode;
  children?: NavNode[];
}

/**
 * Map from plural resource name (lowercased) to the route name used by createRouteURL.
 * Only list routes (not detail routes) are included.
 */
const pluralToRouteName: Record<string, string> = {
  namespaces: 'namespaces',
  nodes: 'nodes',
  pods: 'Pods',
  deployments: 'Deployments',
  statefulsets: 'StatefulSets',
  daemonsets: 'DaemonSets',
  replicasets: 'ReplicaSets',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
  services: 'services',
  endpoints: 'endpoints',
  endpointslices: 'endpointslices',
  ingresses: 'ingresses',
  ingressclasses: 'ingressclasses',
  networkpolicies: 'networkPolicies',
  gateways: 'gateways',
  gatewayclasses: 'gatewayclasses',
  httproutes: 'httproutes',
  grpcroutes: 'grpcroutes',
  referencegrants: 'referencegrants',
  backendtlspolicies: 'backendtlspolicies',
  backendtrafficpolicies: 'backendtrafficpolicies',
  configmaps: 'configMaps',
  secrets: 'secrets',
  serviceaccounts: 'serviceAccounts',
  roles: 'roles',
  clusterroles: 'roles',
  rolebindings: 'roleBindings',
  clusterrolebindings: 'roleBindings',
  horizontalpodautoscalers: 'horizontalPodAutoscalers',
  verticalpodautoscalers: 'verticalPodAutoscalers',
  poddisruptionbudgets: 'podDisruptionBudgets',
  priorityclasses: 'priorityClasses',
  resourcequotas: 'resourceQuotas',
  limitranges: 'limitRanges',
  leases: 'leases',
  runtimeclasses: 'runtimeClasses',
  mutatingwebhookconfigurations: 'mutatingWebhookConfigurations',
  validatingwebhookconfigurations: 'validatingWebhookConfigurations',
  persistentvolumes: 'persistentVolumes',
  persistentvolumeclaims: 'persistentVolumeClaims',
  storageclasses: 'storageClasses',
  customresourcedefinitions: 'crds',
};

/**
 * Map from ResourceCategory label to a route name for the category overview page.
 * Only categories that have a dedicated overview page are listed here.
 */
const categoryOverviewRoutes: Record<string, string> = {
  Workloads: 'workloads',
};

/**
 * Returns the overview URL for a category, or undefined if no overview page exists.
 */
function categoryRoute(category: ResourceCategory): string | undefined {
  const routeName = categoryOverviewRoutes[category.label];
  if (!routeName) return undefined;
  const url = createRouteURL(routeName);
  return url || undefined;
}

/**
 * Returns the URL for a resource list page, or undefined if no route exists.
 * Known resources get their dedicated route. Resources with a group name
 * fall back to the CRD list route. Core resources without a dedicated
 * route return undefined.
 */
function getResourceUrl(resource: ApiResource): string | undefined {
  const routeName = pluralToRouteName[resource.pluralName.toLowerCase()];
  if (routeName) {
    return createRouteURL(routeName);
  }
  // Fall back to CRD route if resource has a group name
  if (resource.groupName) {
    const crdName = `${resource.pluralName}.${resource.groupName}`;
    return createRouteURL('customresources', { crd: crdName });
  }
  return undefined;
}

/**
 * Resolves a NavItem's URL, applying cluster prefix if needed.
 */
function resolveItemUrl(
  item: NavItem,
  clusters: string[]
): string {
  if (!item.url) return '';
  if (item.useClusterURL && clusters.length && !item.url.startsWith('http')) {
    return generatePath(getClusterPrefixedPath(item.url), {
      cluster: formatClusterPathParam(clusters),
    });
  }
  return item.url;
}

/**
 * Groups Custom Resources by their API group name, sorted alphabetically.
 * Returns [groupName, resources][] pairs.
 */
function groupResourcesByApiGroup(
  resources: ApiResource[]
): [string, ApiResource[]][] {
  return Object.entries(groupBy(resources, r => r.groupName ?? 'core')).sort(([a], [b]) =>
    a.localeCompare(b)
  );
}

/**
 * A lightweight node in the navigation tree.
 * Represents a navigable item with optional nested children.
 */
export interface NavNode {
  label: string;
  url: string;
  icon?: string;
  subtitle?: React.ReactNode;
  children?: NavNode[];
}

/** Checks if pathname matches a node's URL or is a sub-path of it */
export function matchesPath(pathname: string, url: string): boolean {
  return pathname === url || pathname.startsWith(url + '/');
}

/** Checks if pathname matches any node or its descendants */
export function containsPath(node: NavNode, pathname: string): boolean {
  if (matchesPath(pathname, node.url)) return true;
  return !!node.children?.some(child => containsPath(child, pathname));
}

/**
 * Builds a navigation tree from categories and static items.
 * Each root entry is a level-0 node; children are level-1, etc.
 *
 * Custom Resources get an extra nesting level:
 *   Custom Resources > API group > individual resources
 */
export function buildNavigationTree(
  categories: Map<ResourceCategory, ApiResource[]>,
  staticItems: NavItem[],
  pluginItems: NavItem[],
  clusters: string[],
  options?: {
    includeInClusterCategories?: boolean;
  }
): NavNode[] {
  const includeCategories = options?.includeInClusterCategories ?? true;

  const fromStatic = staticItems
    .filter(item => !item.hide && item.url)
    .map(item => staticItemToNavNode(item, clusters));

  const fromCategories = includeCategories
    ? ([...categories.entries()]
        .map(([category, resources]) => categoryToNavNode(category, resources))
        .filter(Boolean) as NavNode[])
    : [];

  const fromPlugins = pluginItems
    .filter(item => !item.hide && item.url)
    .map(item => staticItemToNavNode(item, clusters));

  return [...fromStatic, ...fromCategories, ...fromPlugins];
}

function staticItemToNavNode(
  item: NavItem,
  clusters: string[]
): NavNode {
  return {
    label: item.label,
    url: resolveItemUrl(item, clusters),
    icon: item.icon,
    subtitle: item.subtitle,
    children: item.subList
      ?.filter(child => !child.hide && child.url)
      .map(child => ({
        label: child.label,
        url: resolveItemUrl(child, clusters),
      })),
  };
}

function categoryToNavNode(
  category: ResourceCategory,
  resources: ApiResource[]
): NavNode | null {
  const isCustomResources = category === customResourcesCategory;

  if (isCustomResources) {
    const groups = groupResourcesByApiGroup(resources);
    const children = groups
      .map(([groupName, groupResources]) => {
        const grandchildren = groupResources
          .map(r => {
            const url = getResourceUrl(r);
            return url ? { label: r.kind, url } : null;
          })
          .filter(Boolean) as NavNode[];
        if (grandchildren.length === 0) return null;
        return { label: groupName, url: grandchildren[0].url, children: grandchildren };
      })
      .filter(Boolean) as NavNode[];

    if (children.length === 0) return null;
    return { label: category.label, url: children[0].url, icon: category.icon, children };
  }

  const overviewUrl = categoryRoute(category);
  const children = resources
    .map(r => {
      const url = getResourceUrl(r);
      return url ? { label: r.kind, url } : null;
    })
    .filter(Boolean) as NavNode[];

  if (children.length === 0) return null;

  return {
    label: category.label,
    url: overviewUrl ?? children[0].url,
    icon: category.icon,
    children,
  };
}
