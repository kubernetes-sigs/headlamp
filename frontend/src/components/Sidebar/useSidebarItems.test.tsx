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

import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import App from '../../App';
import { request } from '../../lib/k8s/api/v1/clusterRequests';
import { useSelectedClusters } from '../../lib/k8s/api/v1/hooks';
import ClusterTrustBundle from '../../lib/k8s/clusterTrustBundle';
import CRD from '../../lib/k8s/crd';
import DeviceClass from '../../lib/k8s/deviceClass';
import { useGatewayL4RouteAvailability } from '../../lib/k8s/gatewayL4RouteAvailability';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import { DefaultSidebars, SidebarEntry } from './sidebarSlice';
import { useSidebarItems } from './useSidebarItems';

// Fix for a circular dependency issue
// App import will load the whole app dependency tree
// And assigning it to a value will make sure it's not tree-shaken and removed
// eslint-disable-next-line no-unused-vars
const DontDeleteMe = App;

vi.mock('../../lib/k8s/api/v1/hooks', async importOriginal => {
  type HooksModule = typeof import('../../lib/k8s/api/v1/hooks');
  const actual = await importOriginal<HooksModule>();
  return { ...actual, useSelectedClusters: vi.fn(actual.useSelectedClusters) };
});

const { servedSchedulingVersions } = vi.hoisted(() => ({
  servedSchedulingVersions: { current: [] as string[] },
}));

vi.mock('../../lib/k8s/api/v1/clusterRequests', async importOriginal => {
  type ClusterRequestsModule = typeof import('../../lib/k8s/api/v1/clusterRequests');
  const actual = await importOriginal<ClusterRequestsModule>();
  return {
    ...actual,
    request: vi.fn(async (path: string, ...rest: any[]) => {
      if (!path.startsWith('/apis/scheduling.k8s.io/')) {
        return (actual.request as any)(path, ...rest);
      }
      const version = path.replace('/apis/', '');
      if (!servedSchedulingVersions.current.includes(version)) {
        throw new Error('404');
      }
      const resources = ['workloads', 'podgroups'];
      if (version === 'scheduling.k8s.io/v1alpha3') {
        resources.push('compositepodgroups');
      }
      return { resources: resources.map(name => ({ name })) };
    }),
  };
});

vi.mock('../../lib/k8s/gatewayL4RouteAvailability', () => ({
  useGatewayL4RouteAvailability: vi.fn(),
}));

describe('useSidebarItems', () => {
  const mockStore = (
    customSidebarEntries: { [name: string]: SidebarEntry },
    customSidebarFilters: ((entry: SidebarEntry) => SidebarEntry | null)[],
    customHomeSidebarFilters: ((entry: SidebarEntry) => SidebarEntry | null)[] = []
  ) => {
    return configureStore({
      reducer: reducers,
      preloadedState: {
        sidebar: {
          entries: customSidebarEntries,
          filters: customSidebarFilters,
          homeFilters: customHomeSidebarFilters,
          selected: { item: null, sidebar: DefaultSidebars.IN_CLUSTER },
          isVisible: true,
        },
      },
    });
  };
  const queryClient = new QueryClient();

  const wrapper =
    (store: any) =>
    ({ children }: any) =>
      (
        <TestContext>
          <Provider store={store}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
          </Provider>
        </TestContext>
      );

  beforeEach(() => {
    queryClient.clear();
    vi.mocked(useSelectedClusters).mockReturnValue([]);
    servedSchedulingVersions.current = [];
    vi.spyOn(DeviceClass, 'isEnabled').mockResolvedValue(false);
    vi.spyOn(ClusterTrustBundle, 'isEnabled').mockResolvedValue(false);
    const emptyCRDs: [CRD[], null] = [[], null];
    vi.spyOn(CRD, 'useList').mockReturnValue(
      Object.assign(emptyCRDs, {
        data: null,
        dataUpdatedAt: 0,
        items: emptyCRDs[0],
        error: null,
        errors: null,
        isError: false,
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        status: 'success' as const,
      })
    );
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Sidebar unit tests must not make network requests')
    );
    vi.mocked(useGatewayL4RouteAvailability).mockReturnValue({ data: [] } as unknown as ReturnType<
      typeof useGatewayL4RouteAvailability
    >);
  });

  afterEach(async () => {
    cleanup();
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each([
    { label: 'neither route kind', kinds: [], tcpVisible: false, udpVisible: false },
    {
      label: 'only TCPRoute',
      kinds: ['TCPRoute'],
      tcpVisible: true,
      udpVisible: false,
    },
    {
      label: 'only UDPRoute',
      kinds: ['UDPRoute'],
      tcpVisible: false,
      udpVisible: true,
    },
    {
      label: 'both route kinds',
      kinds: ['TCPRoute', 'UDPRoute'],
      tcpVisible: true,
      udpVisible: true,
    },
  ])(
    'independently gates Gateway API L4 routes when focused discovery returns $label',
    ({ kinds, tcpVisible, udpVisible }) => {
      queryClient.setQueryData(
        ['api-discovery'],
        [
          { groupName: 'gateway.networking.k8s.io', kind: 'TCPRoute' },
          { groupName: 'gateway.networking.k8s.io', kind: 'UDPRoute' },
        ]
      );
      vi.mocked(useGatewayL4RouteAvailability).mockReturnValue({
        data: kinds,
      } as unknown as ReturnType<typeof useGatewayL4RouteAvailability>);
      const store = mockStore({}, []);
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(store),
      });

      const gatewayItems = result.current.find(item => item.name === 'gatewayapi')?.subList ?? [];
      expect(gatewayItems.some(item => item.name === 'gateways')).toBe(true);
      expect(gatewayItems.some(item => item.name === 'gatewayclasses')).toBe(true);
      expect(gatewayItems.some(item => item.name === 'httproutes')).toBe(true);
      expect(gatewayItems.some(item => item.name === 'grpcroutes')).toBe(true);
      expect(gatewayItems.some(item => item.name === 'tcproutes')).toBe(tcpVisible);
      expect(gatewayItems.some(item => item.name === 'udproutes')).toBe(udpVisible);
    }
  );

  describe('Cluster Trust Bundles under Security', () => {
    const securityItems = (items: ReturnType<typeof useSidebarItems>) =>
      items.find(item => item.name === 'security')?.subList?.map(item => item.name);

    beforeEach(() => {
      vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster']);
    });

    it('is left out when the cluster does not serve trust bundles', async () => {
      const bundlesEnabled = vi.spyOn(ClusterTrustBundle, 'isEnabled').mockResolvedValue(false);
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      await waitFor(() => expect(bundlesEnabled).toHaveBeenCalledWith('test-cluster'));
      expect(securityItems(result.current)).not.toContain('clusterTrustBundles');
      // The rest of the section is unaffected by the gate.
      expect(securityItems(result.current)).toContain('serviceAccounts');
    });

    it('is listed once the cluster serves them', async () => {
      vi.spyOn(ClusterTrustBundle, 'isEnabled').mockResolvedValue(true);
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      await waitFor(() => expect(securityItems(result.current)).toContain('clusterTrustBundles'));
    });
  });

  describe('the Scheduling (alpha) section', () => {
    const schedulingItems = (items: ReturnType<typeof useSidebarItems>) =>
      items.find(item => item.name === 'scheduling')?.subList?.map(item => item.name);

    beforeEach(() => {
      vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster']);
    });

    it('keeps the section but leaves out Composite Pod Groups when only its gate is off', async () => {
      // CompositePodGroup needs a feature gate on top of the ones PodGroup needs, so a
      // cluster can serve pod groups without serving it.
      servedSchedulingVersions.current = ['scheduling.k8s.io/v1beta1'];
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      await waitFor(() =>
        expect(schedulingItems(result.current)).toEqual(['podGroups', 'schedulingWorkloads'])
      );
    });

    it('lists Composite Pod Groups when the cluster serves both', async () => {
      servedSchedulingVersions.current = ['scheduling.k8s.io/v1alpha3'];
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      await waitFor(() =>
        expect(schedulingItems(result.current)).toEqual([
          'podGroups',
          'compositePodGroups',
          'schedulingWorkloads',
        ])
      );
    });

    it('hides the section when the cluster serves neither', async () => {
      servedSchedulingVersions.current = [];
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      await waitFor(() =>
        expect(request).toHaveBeenCalledWith('/apis/scheduling.k8s.io/v1alpha2', {
          cluster: 'test-cluster',
        })
      );
      expect(schedulingItems(result.current)).toBeUndefined();
    });
  });

  it('should include customSidebarEntries', () => {
    const customEntries = {
      custom1: {
        name: 'custom1',
        label: 'Custom 1',
        url: '/custom1',
      },
      custom2: {
        name: 'custom2',
        label: 'Custom 2',
        url: '/custom2',
        parent: 'custom1',
      },
      outoforder: {
        name: 'outoforder',
        label: 'outoforder',
        url: '/outoforder',
        parent: 'custom3',
      },
      custom3: {
        name: 'custom3',
        label: 'Custom 3',
        url: '/custom3',
        parent: 'custom2',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(result.current.find(it => it.name === 'custom1')).toMatchInlineSnapshot(`
      {
        "label": "Custom 1",
        "name": "custom1",
        "subList": [
          {
            "label": "Overview",
            "name": "custom1",
            "url": "/custom1",
          },
          {
            "label": "Custom 2",
            "name": "custom2",
            "parent": "custom1",
            "subList": [
              {
                "label": "Overview",
                "name": "custom2",
                "url": "/custom2",
              },
              {
                "label": "Custom 3",
                "name": "custom3",
                "parent": "custom2",
                "subList": [
                  {
                    "label": "Overview",
                    "name": "custom3",
                    "url": "/custom3",
                  },
                  {
                    "label": "outoforder",
                    "name": "outoforder",
                    "parent": "custom3",
                    "url": "/outoforder",
                  },
                ],
                "url": "/custom3",
              },
            ],
            "url": "/custom2",
          },
        ],
        "url": "/custom1",
      }
    `);
  });

  it('should add entries to existing items', () => {
    const customEntries = {
      custom1: {
        name: 'custom1',
        label: 'Custom 1',
        url: '/custom1',
        parent: 'storage',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(
      result.current
        .find(it => it.name === customEntries.custom1.parent)
        ?.subList?.find(it => it.name === customEntries.custom1.name)
    ).toBeDefined();
  });

  it('should include subheader entry fields from customSidebarEntries', () => {
    const sx = { fontSize: '1.1rem', textTransform: 'none' };
    const customEntries: { [name: string]: SidebarEntry } = {
      customSection: {
        name: 'customSection',
        label: 'Custom Section',
        entryType: 'subheader',
        sx,
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(result.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'customSection',
          label: 'Custom Section',
          entryType: 'subheader',
          sx,
        }),
      ])
    );
  });

  it('should apply customSidebarFilters', () => {
    const customEntries = {
      custom1: { name: 'custom1', label: 'Custom 1', url: '/custom1' },
      custom2: { name: 'custom2', label: 'Custom 2', url: '/custom2' },
    };
    const customFilters = [(entry: SidebarEntry) => (entry.name === 'custom2' ? null : entry)];

    const store = mockStore(customEntries, customFilters);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    expect(result.current).toEqual(
      expect.arrayContaining([{ name: 'custom1', label: 'Custom 1', url: '/custom1' }])
    );
    expect(result.current).not.toEqual(
      expect.arrayContaining([{ name: 'custom2', label: 'Custom 2', url: '/custom2' }])
    );
  });

  it('should support ReactNode as subtitle', () => {
    const customEntries = {
      custom1: {
        name: 'custom1',
        label: 'Custom 1',
        url: '/custom1',
        subtitle: <div>Custom Subtitle</div>,
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    const item = result.current.find(it => it.name === 'custom1');
    expect(item).toBeDefined();
    expect(item?.subtitle).toBeDefined();
  });

  it('should render cluster badges as subtitles for selected clusters', () => {
    const store = mockStore({}, []);

    const { result } = renderHook(() => useSidebarItems(), {
      wrapper: wrapper(store),
    });

    const clusterItem = result.current?.find(it => it.name === 'cluster' || it.name === 'home');
    expect(clusterItem).toBeDefined();

    // If subtitle exists and is a ReactNode (not a string), that means ClusterBadge components were rendered
    if (clusterItem?.subtitle && typeof clusterItem.subtitle !== 'string') {
      expect(React.isValidElement(clusterItem.subtitle)).toBe(true);
    }
  });

  it('should apply customHomeSidebarFilters to the HOME sidebar', () => {
    const homeFilters = [
      (entry: SidebarEntry) =>
        entry.name === 'settings' || entry.name === 'notifications' ? null : entry,
    ];

    const store = mockStore({}, [], homeFilters);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.HOME), {
      wrapper: wrapper(store),
    });

    // Check that settings and notifications are removed
    expect(result.current.find(it => it.name === 'settings')).toBeUndefined();
    expect(result.current.find(it => it.name === 'notifications')).toBeUndefined();

    // Check that home is still present
    expect(result.current.find(it => it.name === 'home')).toBeDefined();
  });

  it('exposes Overview child in Cluster and Workloads subList and Definitions child in Custom Resources subList', () => {
    const store = mockStore({}, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    const cluster = result.current.find(it => it.name === 'cluster');
    expect(cluster).toBeDefined();
    expect(cluster?.subList?.[0]).toMatchObject({
      name: 'cluster',
      label: 'Overview',
    });

    const workloads = result.current.find(it => it.name === 'workloads');
    expect(workloads).toBeDefined();
    expect(workloads?.subList?.[0]).toMatchObject({
      name: 'workloads',
      label: 'Overview',
    });

    const crds = result.current.find(it => it.name === 'crds');
    expect(crds).toBeDefined();
    expect(crds?.subList?.[0]).toMatchObject({
      name: 'crds',
      label: 'Definitions',
    });
    expect(crds?.subList?.[1]).toMatchObject({
      name: 'crs',
      label: 'Instances',
    });
  });

  it('attaches plugin entries directly to parent groups rather than same-named destination children', () => {
    const customEntries = {
      workloadPlugin: {
        name: 'workloadPlugin',
        label: 'Workload Plugin',
        url: '/workload-plugin',
        parent: 'workloads',
      },
      clusterPlugin: {
        name: 'clusterPlugin',
        label: 'Cluster Plugin',
        url: '/cluster-plugin',
        parent: 'cluster',
      },
      crdPlugin: {
        name: 'crdPlugin',
        label: 'CRD Plugin',
        url: '/crd-plugin',
        parent: 'crds',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    // Workloads: plugin attaches to workloads group, not inside Overview child
    const workloads = result.current.find(it => it.name === 'workloads');
    expect(workloads?.subList?.some(it => it.name === 'workloadPlugin')).toBe(true);
    const workloadsOverview = workloads?.subList?.find(it => it.name === 'workloads');
    expect(workloadsOverview?.subList).toBeUndefined();

    // Cluster: plugin attaches to cluster group, not inside Overview child
    const cluster = result.current.find(it => it.name === 'cluster');
    expect(cluster?.subList?.some(it => it.name === 'clusterPlugin')).toBe(true);
    const clusterOverview = cluster?.subList?.find(it => it.name === 'cluster');
    expect(clusterOverview?.subList).toBeUndefined();

    // CRDs (without CRD list): plugin attaches to crds group, not inside Definitions child
    const crds = result.current.find(it => it.name === 'crds');
    expect(crds?.subList?.some(it => it.name === 'crdPlugin')).toBe(true);
    const crdsDefinitions = crds?.subList?.find(it => it.name === 'crds');
    expect(crdsDefinitions?.subList).toBeUndefined();
  });

  it('attaches plugin entries to Custom Resources parent group when CRDs are populated', () => {
    const mockCRDs: [CRD[], null] = [
      [
        new CRD({
          apiVersion: 'apiextensions.k8s.io/v1',
          kind: 'CustomResourceDefinition',
          metadata: {
            name: 'mycrds.example.com',
            uid: 'phony-crd',
            creationTimestamp: new Date().toISOString(),
          },
          spec: {
            group: 'example.com',
            names: {
              kind: 'MyCRD',
              plural: 'mycrds',
              singular: 'mycrd',
              listKind: 'MyCRDList',
            },
            scope: 'Namespaced',
            versions: [],
            version: 'v1',
          },
        } as any),
      ],
      null,
    ];
    vi.spyOn(CRD, 'useList').mockReturnValue(
      Object.assign(mockCRDs, {
        data: null,
        dataUpdatedAt: 0,
        items: mockCRDs[0],
        error: null,
        errors: null,
        isError: false,
        isLoading: false,
        isFetching: false,
        isSuccess: true,
        status: 'success' as const,
      })
    );

    const customEntries = {
      crdPlugin: {
        name: 'crdPlugin',
        label: 'CRD Plugin',
        url: '/crd-plugin',
        parent: 'crds',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    const crds = result.current.find(it => it.name === 'crds');
    expect(crds?.subList?.some(it => it.name === 'crdPlugin')).toBe(true);
    const crdsDefinitions = crds?.subList?.find(it => it.name === 'crds');
    expect(crdsDefinitions?.subList).toBeUndefined();
  });

  it('generates an Overview destination child for URL-bearing plugin parents without one', () => {
    const customEntries = {
      feedback2: {
        name: 'feedback2',
        label: 'Diff Feedback',
        url: '/feedback2',
        useClusterURL: true,
      },
      feedback3: {
        name: 'feedback3',
        label: 'More Feedback',
        url: '/feedback3',
        parent: 'feedback2',
      },
      feedback4: {
        name: 'feedback4',
        label: 'Other Feedback',
        url: '/feedback4',
        parent: 'feedback2',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    const parent = result.current.find(it => it.name === 'feedback2');
    expect(parent).toBeDefined();
    expect(parent?.subList).toHaveLength(3);
    expect(parent?.subList?.[0]).toEqual({
      name: 'feedback2',
      label: 'Overview',
      url: '/feedback2',
      useClusterURL: true,
    });
    expect(parent?.subList?.[1].name).toBe('feedback3');
    expect(parent?.subList?.[2].name).toBe('feedback4');
  });

  it('does not generate duplicate Overview child if a child already matches the parent URL and cluster setting', () => {
    const customEntries = {
      customGroup: {
        name: 'customGroup',
        label: 'Custom Group',
        url: '/custom-group',
      },
      customGroupChild: {
        name: 'customGroupChild',
        label: 'Custom Group Landing',
        url: '/custom-group',
        parent: 'customGroup',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    const parent = result.current.find(it => it.name === 'customGroup');
    expect(parent).toBeDefined();
    expect(parent?.subList).toHaveLength(1);
    expect(parent?.subList?.[0].name).toBe('customGroupChild');
  });

  it('generates an Overview destination child when child URL matches parent URL but differs in useClusterURL', () => {
    const customEntries = {
      tools: {
        name: 'tools',
        label: 'Tools',
        url: '/tools',
        useClusterURL: true,
      },
      toolsGlobal: {
        name: 'toolsGlobal',
        label: 'Global Tools',
        url: '/tools',
        useClusterURL: false,
        parent: 'tools',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    const tools = result.current.find(it => it.name === 'tools');
    expect(tools?.subList).toHaveLength(2);
    expect(tools?.subList?.[0]).toEqual({
      name: 'tools',
      label: 'Overview',
      url: '/tools',
      useClusterURL: true,
    });
    expect(tools?.subList?.[1].name).toBe('toolsGlobal');
  });

  it('generates an Overview destination child for named-route built-in parents like namespaces', () => {
    const customEntries = {
      nsChild: {
        name: 'nsChild',
        label: 'NS Extension',
        url: '/ns-extension',
        parent: 'namespaces',
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.IN_CLUSTER), {
      wrapper: wrapper(store),
    });

    const clusterGroup = result.current.find(it => it.name === 'cluster');
    const namespacesItem = clusterGroup?.subList?.find(it => it.name === 'namespaces');
    expect(namespacesItem?.subList).toHaveLength(2);
    expect(namespacesItem?.subList?.[0]).toEqual({
      name: 'namespaces',
      label: 'Overview',
    });
    expect(namespacesItem?.subList?.[1].name).toBe('nsChild');
  });

  it('restores custom parent precedence over built-in groups when attaching custom children', () => {
    const customEntries = {
      settings: {
        name: 'settings',
        label: 'Settings',
        url: '/settings/general',
        sidebar: DefaultSidebars.HOME,
      },
      settingsGeneral: {
        name: 'settingsGeneral',
        label: 'General',
        url: '/settings/general',
        parent: 'settings',
        sidebar: DefaultSidebars.HOME,
      },
      plugins: {
        name: 'plugins',
        label: 'Plugins',
        url: '/settings/plugins',
        parent: 'settings',
        sidebar: DefaultSidebars.HOME,
      },
    };

    const store = mockStore(customEntries, []);
    const { result } = renderHook(() => useSidebarItems(DefaultSidebars.HOME), {
      wrapper: wrapper(store),
    });

    const customSettings = result.current.findLast(it => it.name === 'settings');
    expect(customSettings?.subList?.map(it => it.name)).toEqual(['settingsGeneral', 'plugins']);
  });

  it('preserves last-entry precedence for built-in home leaf entries when attaching plugin children', () => {
    const customEntries = {
      homePlugin: {
        name: 'homePlugin',
        label: 'Home Plugin',
        url: '/home-plugin',
        parent: 'home',
      },
    };

    const store = mockStore(customEntries, []);
    const { result: inClusterResult } = renderHook(
      () => useSidebarItems(DefaultSidebars.IN_CLUSTER),
      {
        wrapper: wrapper(store),
      }
    );
    const { result: homeResult } = renderHook(() => useSidebarItems(DefaultSidebars.HOME), {
      wrapper: wrapper(store),
    });

    const inClusterHome = inClusterResult.current.find(it => it.name === 'home');
    expect(inClusterHome?.subList?.some(it => it.name === 'homePlugin')).toBe(true);
    expect(inClusterHome?.subList?.[0]).toEqual({
      name: 'home',
      label: 'Overview',
      url: '/',
    });

    const homeSidebarHome = homeResult.current.find(it => it.name === 'home');
    expect(homeSidebarHome?.subList).toBeUndefined();
  });
});
