/*
 * Copyright 2026 The Kubernetes Authors
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setConfig, setStatelessConfig } from '../redux/configSlice';
import store from '../redux/stores/store';
import { TestContext } from '../test';
import { RegisteredClusterOrigin, useRegisteredClusters } from './clusterRegistration';
import { ClusterProfile } from './k8s/clusterProfile';

it('updates discovered connections and filters them by source and owner', () => {
  const origin: RegisteredClusterOrigin = {
    cluster: 'management',
    resource: {
      apiVersion: 'multicluster.x-k8s.io/v1alpha1',
      kind: 'ClusterProfile',
      namespace: 'team-a',
      name: 'workload',
      uid: 'owner-uid',
    },
  };
  const discovered = {
    name: 'workload-route',
    auth_type: 'oidc',
    meta_data: {
      source: 'cluster_inventory',
      discoveryOrigin: origin,
      presentation: { displayName: 'Workload A', fields: {} },
    },
  };
  const regular = { name: 'ordinary', auth_type: '' };
  const initial = store.getState().config;

  try {
    store.dispatch(setConfig({ clusters: { [regular.name]: regular } }));
    const { result, rerender } = renderHook(
      (namespace: string) =>
        useRegisteredClusters({
          source: 'cluster_inventory',
          originCluster: 'management',
          originNamespace: namespace,
        }),
      {
        initialProps: 'team-a',
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      }
    );

    expect(result.current).toEqual([]);
    act(() => {
      store.dispatch(
        setConfig({ clusters: { [discovered.name]: discovered, [regular.name]: regular } })
      );
    });
    expect(result.current).toEqual([
      { id: 'workload-route', displayName: 'Workload A', source: 'cluster_inventory', origin },
    ]);

    const registrations = result.current;
    act(() => {
      store.dispatch(
        setConfig({
          clusters: {
            [discovered.name]: discovered,
            [regular.name]: { ...regular, useToken: true },
          },
        })
      );
    });
    expect(result.current).toBe(registrations);

    rerender('team-b');
    expect(result.current).toEqual([]);
    rerender('team-a');
    expect(result.current).toEqual(registrations);

    // A browser-imported connection with the same name is the one the hooks would reach.
    act(() => {
      store.dispatch(
        setStatelessConfig({
          statelessClusters: { [discovered.name]: { name: discovered.name, auth_type: 'oidc' } },
        })
      );
    });
    expect(result.current).toEqual([]);

    act(() => {
      store.dispatch(setStatelessConfig({ statelessClusters: {} }));
    });
    expect(result.current).toEqual(registrations);

    act(() => {
      store.dispatch(setConfig({ clusters: {} }));
    });
    expect(result.current).toEqual([]);
  } finally {
    act(() => {
      store.dispatch(setStatelessConfig({ statelessClusters: initial.statelessClusters }));
      store.dispatch(setConfig({ clusters: initial.clusters }));
    });
  }
});

describe('ClusterProfile.useRegisteredClusters', () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const registration = (id: string, namespace: string, name: string, uid: string) => ({
    name: id,
    auth_type: 'oidc',
    meta_data: {
      source: 'cluster_inventory',
      discoveryOrigin: {
        cluster: 'hub',
        resource: {
          apiVersion: 'multicluster.x-k8s.io/v1alpha1',
          kind: 'ClusterProfile',
          namespace,
          name,
          uid,
        },
      },
    },
  });
  const profile = (namespace: string, name: string, uid: string) => ({
    apiVersion: 'multicluster.x-k8s.io/v1alpha1',
    kind: 'ClusterProfile',
    metadata: { namespace, name, uid, resourceVersion: '1' },
    spec: { clusterManager: { name: 'open-cluster-management' } },
  });

  it('returns connections with the ClusterProfiles the user can read', async () => {
    const initial = store.getState().config;
    let labelSelector: string | null = null;
    server.use(
      http.get(
        /\/clusters\/hub\/apis\/multicluster.x-k8s.io\/v1alpha1\/namespaces\/team-a\/clusterprofiles/,
        ({ request }) => {
          labelSelector = new URL(request.url).searchParams.get('labelSelector');
          return HttpResponse.json({
            apiVersion: 'multicluster.x-k8s.io/v1alpha1',
            kind: 'ClusterProfileList',
            metadata: { resourceVersion: '1' },
            // "recreated" now has a new UID, and "excluded" does not match the selector.
            items: [
              profile('team-a', 'edge', 'uid-edge'),
              profile('team-a', 'recreated', 'uid-new'),
            ],
          });
        }
      ),
      http.get(
        /\/clusters\/hub\/apis\/multicluster.x-k8s.io\/v1alpha1\/namespaces\/team-b\/clusterprofiles/,
        () =>
          HttpResponse.json({ kind: 'Status', code: 403, message: 'forbidden' }, { status: 403 })
      )
    );

    try {
      store.dispatch(
        setConfig({
          clusters: {
            hub: { name: 'hub', auth_type: '' },
            'edge-route': registration('edge-route', 'team-a', 'edge', 'uid-edge'),
            'recreated-route': registration('recreated-route', 'team-a', 'recreated', 'uid-old'),
            'excluded-route': registration('excluded-route', 'team-a', 'excluded', 'uid-excluded'),
            'blocked-route': registration('blocked-route', 'team-b', 'blocked', 'uid-blocked'),
          },
        })
      );
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const { result } = renderHook(
        () =>
          ClusterProfile.useRegisteredClusters({
            originCluster: 'hub',
            labelSelector: 'x-k8s.io/cluster-manager=open-cluster-management',
          }),
        {
          wrapper: ({ children }: { children: ReactNode }) => (
            <TestContext store={store}>
              <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
            </TestContext>
          ),
        }
      );

      await waitFor(() => expect(result.current.clusters).toHaveLength(2));
      const clusters = [...result.current.clusters].sort((a, b) => a.id.localeCompare(b.id));
      expect(clusters.map(cluster => [cluster.id, cluster.ownerError?.status ?? null])).toEqual([
        ['blocked-route', 403],
        ['edge-route', null],
      ]);
      expect(clusters[1].owner).toBeInstanceOf(ClusterProfile);
      expect(clusters[1].owner?.spec.clusterManager.name).toBe('open-cluster-management');
      expect(labelSelector).toBe('x-k8s.io/cluster-manager=open-cluster-management');
      expect(result.current.isLoading).toBe(false);
    } finally {
      act(() => {
        store.dispatch(setConfig({ clusters: initial.clusters }));
      });
    }
  });
});
