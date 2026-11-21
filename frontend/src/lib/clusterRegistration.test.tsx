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

import { act, renderHook } from '@testing-library/react';
import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { expect, it } from 'vitest';
import { setConfig } from '../redux/configSlice';
import store from '../redux/stores/store';
import { RegisteredClusterOrigin, useRegisteredClusters } from './clusterRegistration';

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
  const initial = store.getState().config.clusters;

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

    act(() => {
      store.dispatch(setConfig({ clusters: {} }));
    });
    expect(result.current).toEqual([]);
  } finally {
    act(() => {
      store.dispatch(setConfig({ clusters: initial }));
    });
  }
});
