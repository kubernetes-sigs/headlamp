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
            "label": "Custom 2",
            "name": "custom2",
            "parent": "custom1",
            "subList": [
              {
                "label": "Custom 3",
                "name": "custom3",
                "parent": "custom2",
                "subList": [
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

  describe('Custom Resources entries', () => {
    const makeCRD = (name: string, group?: string, kind?: string) =>
      ({
        jsonData: {
          metadata: { name },
          spec: { group, names: kind ? { kind } : undefined },
        },
      } as unknown as CRD);

    const mockCRDs = (crds: CRD[] | null, error: unknown = null) => {
      const result: [CRD[] | null, unknown] = [crds, error];
      vi.spyOn(CRD, 'useList').mockReturnValue(
        Object.assign(result, {
          data: null,
          dataUpdatedAt: 0,
          items: crds,
          error,
          errors: null,
          isError: error !== null,
          isLoading: false,
          isFetching: false,
          isSuccess: error === null,
          status: 'success' as const,
        }) as unknown as ReturnType<typeof CRD.useList>
      );
    };

    const crdsItem = (items: ReturnType<typeof useSidebarItems>) =>
      items.find(item => item.name === 'crds');

    it('groups CRDs by API group, sorts them and lists each kind once', () => {
      mockCRDs([
        makeCRD('widgets.zeta.io', 'zeta.io', 'Widget'),
        makeCRD('gadgets.alpha.io', 'alpha.io', 'Gadget'),
        makeCRD('gizmos.alpha.io', 'alpha.io', 'Gizmo'),
        // Same CRD seen twice must not be listed twice.
        makeCRD('gadgets.alpha.io', 'alpha.io', 'Gadget'),
      ]);

      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      const subList = crdsItem(result.current)?.subList ?? [];
      expect(subList.map(item => item.name)).toEqual(['crs', 'group-alpha.io', 'group-zeta.io']);
      expect(subList[0].divider).toBe(true);
      const alpha = subList.find(item => item.name === 'group-alpha.io');
      expect(alpha?.isCR).toBe(true);
      expect(alpha?.subList?.map(item => item.name)).toEqual([
        'gadgets.alpha.io',
        'gizmos.alpha.io',
      ]);
      expect(alpha?.subList?.map(item => item.label)).toEqual(['Gadget', 'Gizmo']);
    });

    it('skips CRDs whose spec is only partially populated', () => {
      mockCRDs([
        makeCRD('nokind.example.io', 'example.io', undefined),
        makeCRD('nogroup', undefined, 'NoGroup'),
        makeCRD('good.example.io', 'example.io', 'Good'),
      ]);

      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      const group = crdsItem(result.current)?.subList?.find(
        item => item.name === 'group-example.io'
      );
      expect(group?.subList?.map(item => item.name)).toEqual(['good.example.io']);
      expect(crdsItem(result.current)?.subList?.some(item => item.name === 'group-undefined')).toBe(
        false
      );
    });

    it('only lists the Instances entry while the CRDs are still loading', () => {
      mockCRDs(null);

      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      expect(crdsItem(result.current)?.subList?.map(item => item.name)).toEqual(['crs']);
    });

    it('logs the error and keeps the sidebar working when CRDs fail to load', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('boom');
      mockCRDs(null, error);

      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      expect(consoleError).toHaveBeenCalledWith('Failed to fetch CRDs:', error);
      expect(crdsItem(result.current)?.subList?.map(item => item.name)).toEqual(['crs']);
    });

    it('does not add CRD entries to a sidebar other than the in-cluster one', () => {
      mockCRDs([makeCRD('widgets.zeta.io', 'zeta.io', 'Widget')]);

      const { result } = renderHook(() => useSidebarItems(DefaultSidebars.HOME), {
        wrapper: wrapper(mockStore({}, [])),
      });

      expect(crdsItem(result.current)).toBeUndefined();
    });
  });

  describe('Devices (alpha) section', () => {
    it('is hidden when the cluster does not serve resource.k8s.io/v1', () => {
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      expect(result.current.find(item => item.name === 'devices')).toBeUndefined();
    });

    it('lists the device resources once the cluster serves them', async () => {
      vi.mocked(useSelectedClusters).mockReturnValue(['test-cluster']);
      vi.spyOn(DeviceClass, 'isEnabled').mockResolvedValue(true);

      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, [])),
      });

      await waitFor(() =>
        expect(
          result.current.find(item => item.name === 'devices')?.subList?.map(item => item.name)
        ).toEqual(['deviceClasses', 'resourceClaims', 'resourceClaimTemplates', 'resourceSlices'])
      );
    });
  });

  describe('custom entries and sidebars', () => {
    it('creates a new sidebar for a custom entry that names one that does not exist', () => {
      const store = mockStore(
        { mine: { name: 'mine', label: 'Mine', url: '/mine', sidebar: 'my-sidebar' } },
        []
      );

      const { result } = renderHook(() => useSidebarItems('my-sidebar'), {
        wrapper: wrapper(store),
      });

      expect(result.current.map(item => item.name)).toEqual(['mine']);
    });

    it('ignores a custom entry whose parent does not exist', () => {
      const store = mockStore(
        { orphan: { name: 'orphan', label: 'Orphan', url: '/orphan', parent: 'nope' } },
        []
      );

      const { result } = renderHook(() => useSidebarItems(), { wrapper: wrapper(store) });

      expect(JSON.stringify(result.current)).not.toContain('orphan');
    });

    it('does not change the custom entries held in the store', () => {
      const entries = {
        child: { name: 'child', label: 'Child', url: '/child', parent: 'network' },
      };
      const store = mockStore(entries, []);

      renderHook(() => useSidebarItems(), { wrapper: wrapper(store) });

      expect(store.getState().sidebar.entries).toEqual(entries);
    });

    it('falls back to the in-cluster sidebar when the sidebar name is empty', () => {
      const { result } = renderHook(() => useSidebarItems(''), {
        wrapper: wrapper(mockStore({}, [])),
      });

      expect(result.current.some(item => item.name === 'workloads')).toBe(true);
    });

    it('returns an empty list for a sidebar that does not exist', () => {
      const { result } = renderHook(() => useSidebarItems('missing'), {
        wrapper: wrapper(mockStore({}, [])),
      });

      expect(result.current).toEqual([]);
    });

    it('applies every custom filter in order and filters nested entries', () => {
      const filters = [
        (entry: SidebarEntry) => (entry.name === 'storage' ? null : entry),
        (entry: SidebarEntry) => (entry.name === 'services' ? null : entry),
      ];

      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(mockStore({}, filters)),
      });

      expect(result.current.find(item => item.name === 'storage')).toBeUndefined();
      const network = result.current.find(item => item.name === 'network');
      expect(network).toBeDefined();
      expect(network?.subList?.some(item => item.name === 'services')).toBe(false);
      expect(network?.subList?.some(item => item.name === 'endpoints')).toBe(true);
    });
  });

  describe('sorting', () => {
    const storeWithSorting = (sortAlphabetically: boolean) => {
      const config = configureStore({ reducer: reducers }).getState().config;
      return configureStore({
        reducer: reducers,
        preloadedState: {
          config: { ...config, userSettings: { sidebarSortAlphabetically: sortAlphabetically } },
          sidebar: {
            entries: {},
            filters: [],
            homeFilters: [],
            selected: { item: null, sidebar: DefaultSidebars.IN_CLUSTER },
            isVisible: true,
          },
        } as any,
      });
    };

    it('keeps the default order when alphabetical sorting is off', () => {
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(storeWithSorting(false)),
      });

      expect(result.current.map(item => item.name).slice(0, 4)).toEqual([
        'home',
        'cluster',
        'map',
        'workloads',
      ]);
    });

    it('sorts by label with home first when alphabetical sorting is on', () => {
      const { result } = renderHook(() => useSidebarItems(), {
        wrapper: wrapper(storeWithSorting(true)),
      });

      const names = result.current.map(item => item.name);
      expect(names[0]).toBe('home');
      const labels = result.current
        .filter(item => item.name !== 'home')
        .map(item => ((item.label ?? item.name) + '').toLowerCase());
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
      // Sub lists are sorted as well.
      const network = result.current.find(item => item.name === 'network');
      const subLabels = (network?.subList ?? []).map(item =>
        ((item.label ?? '') + '').toLowerCase()
      );
      expect(subLabels).toEqual([...subLabels].sort((a, b) => a.localeCompare(b)));
    });
  });
});
