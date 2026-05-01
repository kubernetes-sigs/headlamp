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

import { ApiResource } from '../../lib/k8s/api/v2/ApiResource';
import { customResourcesCategory, ResourceCategory } from '../../lib/k8s/ResourceCategory';
import {
  buildNavigationTree,
  containsPath,
  matchesPath,
  NavItem,
  NavNode,
} from './navigationUtils';

// Mock createRouteURL so we don't depend on Redux store / route registry
vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: (routeName: string, params?: Record<string, string>) => {
    if (params?.crd) return `/customresources/${params.crd}`;
    return `/${routeName}`;
  },
}));

// Mock cluster helpers used by resolveItemUrl
vi.mock('../../lib/cluster', () => ({
  formatClusterPathParam: (clusters: string[]) => clusters.join('+'),
  getClusterPrefixedPath: (path: string) => `/c/:cluster${path}`,
}));

describe('matchesPath', () => {
  it('returns true for exact match', () => {
    expect(matchesPath('/pods', '/pods')).toBe(true);
  });

  it('returns true for sub-path', () => {
    expect(matchesPath('/pods/my-pod', '/pods')).toBe(true);
  });

  it('returns false for non-matching path', () => {
    expect(matchesPath('/deployments', '/pods')).toBe(false);
  });

  it('returns false for partial prefix that is not a path segment', () => {
    expect(matchesPath('/pods-extra', '/pods')).toBe(false);
  });

  it('returns true when both are root', () => {
    expect(matchesPath('/', '/')).toBe(true);
  });

  it('handles trailing slash on pathname', () => {
    expect(matchesPath('/pods/', '/pods')).toBe(true);
  });
});

describe('containsPath', () => {
  it('returns true when node url matches', () => {
    const node: NavNode = { label: 'Pods', url: '/pods' };
    expect(containsPath(node, '/pods')).toBe(true);
  });

  it('returns true when a child url matches', () => {
    const node: NavNode = {
      label: 'Workloads',
      url: '/workloads',
      children: [
        { label: 'Pods', url: '/pods' },
        { label: 'Deployments', url: '/deployments' },
      ],
    };
    expect(containsPath(node, '/pods')).toBe(true);
  });

  it('returns true when a grandchild url matches', () => {
    const node: NavNode = {
      label: 'Custom Resources',
      url: '/cr',
      children: [
        {
          label: 'group.io',
          url: '/cr/a',
          children: [{ label: 'A', url: '/cr/a' }],
        },
      ],
    };
    expect(containsPath(node, '/cr/a')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    const node: NavNode = {
      label: 'Workloads',
      url: '/workloads',
      children: [{ label: 'Pods', url: '/pods' }],
    };
    expect(containsPath(node, '/services')).toBe(false);
  });

  it('returns true for sub-path match on a child', () => {
    const node: NavNode = {
      label: 'Cluster',
      url: '/cluster',
      children: [{ label: 'Namespaces', url: '/namespaces' }],
    };
    expect(containsPath(node, '/namespaces/default')).toBe(true);
  });

  it('returns false for node with no children and non-matching url', () => {
    const node: NavNode = { label: 'Home', url: '/' };
    expect(containsPath(node, '/settings')).toBe(false);
  });
});

describe('buildNavigationTree', () => {
  const emptyCategories = new Map<ResourceCategory, ApiResource[]>();

  describe('static items', () => {
    it('converts static items to NavNodes', () => {
      const items: NavItem[] = [
        { name: 'home', label: 'Home', url: '/', icon: 'mdi:home' },
        { name: 'map', label: 'Map', url: '/map', icon: 'mdi:map' },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        label: 'Home',
        url: '/',
        icon: 'mdi:home',
        subtitle: undefined,
        children: undefined,
      });
      expect(result[1]).toEqual({
        label: 'Map',
        url: '/map',
        icon: 'mdi:map',
        subtitle: undefined,
        children: undefined,
      });
    });

    it('filters out hidden items', () => {
      const items: NavItem[] = [
        { name: 'visible', label: 'Visible', url: '/visible' },
        { name: 'hidden', label: 'Hidden', url: '/hidden', hide: true },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Visible');
    });

    it('filters out items with empty url', () => {
      const items: NavItem[] = [
        { name: 'nourl', label: 'No URL', url: '' },
        { name: 'hasurl', label: 'Has URL', url: '/something' },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Has URL');
    });

    it('converts subList to children', () => {
      const items: NavItem[] = [
        {
          name: 'settings',
          label: 'Settings',
          url: '/settings',
          icon: 'mdi:cog',
          subList: [
            { name: 'general', label: 'General', url: '/settings/general' },
            { name: 'plugins', label: 'Plugins', url: '/settings/plugins' },
          ],
        },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result).toHaveLength(1);
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children![0]).toEqual({ label: 'General', url: '/settings/general' });
      expect(result[0].children![1]).toEqual({ label: 'Plugins', url: '/settings/plugins' });
    });

    it('filters hidden children in subList', () => {
      const items: NavItem[] = [
        {
          name: 'parent',
          label: 'Parent',
          url: '/parent',
          subList: [
            { name: 'visible', label: 'Visible', url: '/parent/visible' },
            { name: 'hidden', label: 'Hidden', url: '/parent/hidden', hide: true },
          ],
        },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result[0].children).toHaveLength(1);
      expect(result[0].children![0].label).toBe('Visible');
    });

    it('filters children with empty url in subList', () => {
      const items: NavItem[] = [
        {
          name: 'parent',
          label: 'Parent',
          url: '/parent',
          subList: [
            { name: 'hasurl', label: 'Has URL', url: '/parent/child' },
            { name: 'nourl', label: 'No URL', url: '' },
          ],
        },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result[0].children).toHaveLength(1);
    });
  });

  describe('plugin items', () => {
    it('appends plugin items after static items', () => {
      const staticItems: NavItem[] = [{ name: 'home', label: 'Home', url: '/' }];
      const pluginItems: NavItem[] = [
        { name: 'plugin1', label: 'My Plugin', url: '/plugin1', icon: 'mdi:puzzle' },
      ];

      const result = buildNavigationTree(emptyCategories, staticItems, pluginItems, []);

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Home');
      expect(result[1].label).toBe('My Plugin');
    });

    it('filters hidden plugin items', () => {
      const pluginItems: NavItem[] = [
        { name: 'visible', label: 'Visible Plugin', url: '/p1' },
        { name: 'hidden', label: 'Hidden Plugin', url: '/p2', hide: true },
      ];

      const result = buildNavigationTree(emptyCategories, [], pluginItems, []);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Visible Plugin');
    });

    it('adds a plugin entry as a child of an existing static item like Workloads', () => {
      // Simulates what useNavigationTree does: the hook merges plugin entries with
      // parent references into the parent's subList before calling buildNavigationTree.
      const staticItems: NavItem[] = [
        {
          name: 'workloads',
          label: 'Workloads',
          url: '/workloads',
          icon: 'mdi:circle-slice-2',
          subList: [
            { name: 'Pods', label: 'Pods', url: '/pods' },
            { name: 'Deployments', label: 'Deployments', url: '/deployments' },
            // Plugin-added child, merged by the hook before buildNavigationTree is called
            { name: 'myCustomWorkload', label: 'My Custom Workload', url: '/my-custom-workload' },
          ],
        },
      ];

      const result = buildNavigationTree(emptyCategories, staticItems, [], []);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Workloads');
      expect(result[0].children).toHaveLength(3);
      expect(result[0].children![0].label).toBe('Pods');
      expect(result[0].children![1].label).toBe('Deployments');
      expect(result[0].children![2].label).toBe('My Custom Workload');
      expect(result[0].children![2].url).toBe('/my-custom-workload');
    });

    it('adds a plugin entry as a child of an existing plugin item', () => {
      const pluginItems: NavItem[] = [
        {
          name: 'mySection',
          label: 'My Section',
          url: '/my-section',
          icon: 'mdi:view-dashboard',
          subList: [
            { name: 'child1', label: 'Child One', url: '/my-section/child1' },
            { name: 'child2', label: 'Child Two', url: '/my-section/child2' },
          ],
        },
      ];

      const result = buildNavigationTree(emptyCategories, [], pluginItems, []);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('My Section');
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children![0].label).toBe('Child One');
      expect(result[0].children![1].label).toBe('Child Two');
    });
  });

  describe('cluster URL resolution', () => {
    it('resolves useClusterURL items with cluster prefix', () => {
      const items: NavItem[] = [
        { name: 'clusterItem', label: 'Cluster Thing', url: '/thing', useClusterURL: true },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], ['my-cluster']);

      expect(result[0].url).toBe('/c/my-cluster/thing');
    });

    it('joins multiple clusters in URL', () => {
      const items: NavItem[] = [
        { name: 'item', label: 'Item', url: '/thing', useClusterURL: true },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], ['cluster-a', 'cluster-b']);

      expect(result[0].url).toBe('/c/cluster-a+cluster-b/thing');
    });

    it('does not apply cluster prefix when useClusterURL is false', () => {
      const items: NavItem[] = [{ name: 'item', label: 'Item', url: '/thing' }];

      const result = buildNavigationTree(emptyCategories, items, [], ['my-cluster']);

      expect(result[0].url).toBe('/thing');
    });

    it('does not apply cluster prefix when clusters array is empty', () => {
      const items: NavItem[] = [
        { name: 'item', label: 'Item', url: '/thing', useClusterURL: true },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], []);

      expect(result[0].url).toBe('/thing');
    });

    it('does not apply cluster prefix to http URLs', () => {
      const items: NavItem[] = [
        { name: 'item', label: 'External', url: 'http://example.com', useClusterURL: true },
      ];

      const result = buildNavigationTree(emptyCategories, items, [], ['my-cluster']);

      expect(result[0].url).toBe('http://example.com');
    });
  });

  describe('categories', () => {
    const makeResource = (kind: string, pluralName: string, groupName?: string): ApiResource => ({
      kind,
      pluralName,
      groupName,
      apiVersion: 'v1',
      isNamespaced: true,
      version: 'v1',
      singularName: '',
    });

    const workloadsCategory: ResourceCategory = {
      label: 'Workloads',
      icon: 'mdi:circle-slice-2',
      description: 'Workload resources',
    };

    const networkCategory: ResourceCategory = {
      label: 'Network',
      icon: 'mdi:network',
      description: 'Network resources',
    };

    it('creates nodes from resource categories', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [
          workloadsCategory,
          [makeResource('Pod', 'pods'), makeResource('Deployment', 'deployments')],
        ],
      ]);

      const result = buildNavigationTree(categories, [], [], []);

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('Workloads');
      expect(result[0].icon).toBe('mdi:circle-slice-2');
      // Workloads has a category overview route
      expect(result[0].url).toBe('/workloads');
      expect(result[0].children).toHaveLength(2);
      expect(result[0].children![0].label).toBe('Pod');
      expect(result[0].children![0].url).toBe('/Pods');
      expect(result[0].children![1].label).toBe('Deployment');
      expect(result[0].children![1].url).toBe('/Deployments');
    });

    it('uses first child URL when category has no overview route', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [networkCategory, [makeResource('Service', 'services')]],
      ]);

      const result = buildNavigationTree(categories, [], [], []);

      expect(result[0].url).toBe('/services');
    });

    it('skips categories with no resolvable resources', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [networkCategory, [makeResource('UnknownThing', 'unknownthings')]],
      ]);

      const result = buildNavigationTree(categories, [], [], []);

      expect(result).toHaveLength(0);
    });

    it('places categories between static items and plugin items', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [workloadsCategory, [makeResource('Pod', 'pods')]],
      ]);
      const staticItems: NavItem[] = [{ name: 'home', label: 'Home', url: '/' }];
      const pluginItems: NavItem[] = [{ name: 'plugin', label: 'Plugin', url: '/plugin' }];

      const result = buildNavigationTree(categories, staticItems, pluginItems, []);

      expect(result.map(n => n.label)).toEqual(['Home', 'Workloads', 'Plugin']);
    });

    it('excludes categories when includeInClusterCategories is false', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [workloadsCategory, [makeResource('Pod', 'pods')]],
      ]);

      const result = buildNavigationTree(categories, [], [], [], {
        includeInClusterCategories: false,
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('custom resources', () => {
    const makeResource = (kind: string, pluralName: string, groupName: string): ApiResource => ({
      kind,
      pluralName,
      groupName,
      apiVersion: 'v1',
      isNamespaced: true,
      version: 'v1',
      singularName: '',
    });

    it('groups custom resources by API group', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [
          customResourcesCategory,
          [
            makeResource('Certificate', 'certificates', 'cert-manager.io'),
            makeResource('Issuer', 'issuers', 'cert-manager.io'),
            makeResource('ServiceMonitor', 'servicemonitors', 'monitoring.coreos.com'),
          ],
        ],
      ]);

      const result = buildNavigationTree(categories, [], [], []);

      expect(result).toHaveLength(1);
      const crNode = result[0];
      expect(crNode.label).toBe('Custom Resources');
      expect(crNode.icon).toBe('mdi:puzzle-outline');
      // Children are API groups, sorted alphabetically
      expect(crNode.children).toHaveLength(2);
      expect(crNode.children![0].label).toBe('cert-manager.io');
      expect(crNode.children![1].label).toBe('monitoring.coreos.com');
      // Grandchildren are individual resources
      expect(crNode.children![0].children).toHaveLength(2);
      expect(crNode.children![0].children![0].label).toBe('Certificate');
      expect(crNode.children![0].children![1].label).toBe('Issuer');
      expect(crNode.children![1].children).toHaveLength(1);
      expect(crNode.children![1].children![0].label).toBe('ServiceMonitor');
    });

    it('uses CRD URL pattern for custom resources', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [customResourcesCategory, [makeResource('Certificate', 'certificates', 'cert-manager.io')]],
      ]);

      const result = buildNavigationTree(categories, [], [], []);

      const crNode = result[0];
      expect(crNode.url).toBe('/customresources/certificates.cert-manager.io');
      expect(crNode.children![0].url).toBe('/customresources/certificates.cert-manager.io');
      expect(crNode.children![0].children![0].url).toBe(
        '/customresources/certificates.cert-manager.io'
      );
    });

    it('returns null for empty custom resources', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([[customResourcesCategory, []]]);

      const result = buildNavigationTree(categories, [], [], []);

      expect(result).toHaveLength(0);
    });

    it('sorts API groups alphabetically', () => {
      const categories = new Map<ResourceCategory, ApiResource[]>([
        [
          customResourcesCategory,
          [
            makeResource('Z', 'zs', 'z-group.io'),
            makeResource('A', 'as', 'a-group.io'),
            makeResource('M', 'ms', 'm-group.io'),
          ],
        ],
      ]);

      const result = buildNavigationTree(categories, [], [], []);

      const groupLabels = result[0].children!.map(c => c.label);
      expect(groupLabels).toEqual(['a-group.io', 'm-group.io', 'z-group.io']);
    });
  });

  describe('combined tree', () => {
    it('builds a complete tree with static, categories, and plugin items', () => {
      const makeResource = (kind: string, pluralName: string): ApiResource => ({
        kind,
        pluralName,
        apiVersion: 'v1',
        isNamespaced: true,
        version: 'v1',
        singularName: '',
      });

      const workloadsCategory: ResourceCategory = {
        label: 'Workloads',
        icon: 'mdi:circle-slice-2',
        description: 'Workload resources',
      };

      const categories = new Map<ResourceCategory, ApiResource[]>([
        [workloadsCategory, [makeResource('Pod', 'pods')]],
      ]);

      const staticItems: NavItem[] = [
        { name: 'home', label: 'Home', url: '/', icon: 'mdi:home' },
        {
          name: 'cluster',
          label: 'Cluster',
          url: '/cluster',
          icon: 'mdi:hexagon-multiple-outline',
          subList: [{ name: 'namespaces', label: 'Namespaces', url: '/namespaces' }],
        },
      ];

      const pluginItems: NavItem[] = [
        { name: 'myPlugin', label: 'My Plugin', url: '/my-plugin', icon: 'mdi:puzzle' },
      ];

      const result = buildNavigationTree(categories, staticItems, pluginItems, []);

      expect(result).toHaveLength(4); // Home, Cluster, Workloads, My Plugin
      expect(result[0].label).toBe('Home');
      expect(result[1].label).toBe('Cluster');
      expect(result[1].children).toHaveLength(1);
      expect(result[2].label).toBe('Workloads');
      expect(result[2].children![0].label).toBe('Pod');
      expect(result[3].label).toBe('My Plugin');
    });
  });
});
