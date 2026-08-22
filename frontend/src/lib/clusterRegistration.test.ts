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

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TestContext } from '../test';
import { makeRegisteredCluster } from '../test/clusterRegistration';
import {
  getClusterRoute,
  setRegisteredClusterSnapshot,
  useRegisteredClusters,
} from './clusterRegistration';

const renderRegistrations = (options?: Parameters<typeof useRegisteredClusters>[0]) =>
  renderHook(() => useRegisteredClusters(options), { wrapper: TestContext });

const registrations = [
  makeRegisteredCluster({ id: 'hr-v1-inventory', displayName: 'inventory spoke' }),
  makeRegisteredCluster({
    id: 'hr-v1-capi',
    displayName: 'capi spoke',
    source: 'cluster-api',
    origin: {
      cluster: 'hub',
      resource: {
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        namespace: 'clusters',
        name: 'capi-spoke',
        uid: 'uid-capi',
      },
    },
  }),
];

describe('cluster registrations', () => {
  afterEach(() => {
    act(() => setRegisteredClusterSnapshot(undefined));
  });

  it('filters registrations and resolves opaque IDs through their origin cluster', () => {
    act(() => setRegisteredClusterSnapshot({ items: registrations }));

    const { result } = renderRegistrations({
      source: 'cluster-inventory',
      originNamespace: 'headlamp',
    });
    expect(result.current.map(item => item.id)).toEqual(['hr-v1-inventory']);
    expect(getClusterRoute('hr-v1-inventory')).toBe('hub/federated/hr-v1-inventory');
    expect(getClusterRoute('hub')).toBe('hub');
  });

  it('does not re-render subscribers when a re-fetch publishes the same items', () => {
    act(() => setRegisteredClusterSnapshot({ items: registrations }));

    const { result } = renderRegistrations();
    const first = result.current;

    act(() => setRegisteredClusterSnapshot({ items: [...registrations] }));
    expect(result.current).toBe(first);

    act(() => setRegisteredClusterSnapshot({ items: [registrations[0]] }));
    expect(result.current).toHaveLength(1);
  });

  it('stops routing a cluster through its origin once it is unregistered', () => {
    act(() => setRegisteredClusterSnapshot({ items: registrations }));
    expect(getClusterRoute('hr-v1-capi')).toBe('hub/federated/hr-v1-capi');

    act(() => setRegisteredClusterSnapshot({ items: [registrations[0]] }));
    expect(getClusterRoute('hr-v1-capi')).toBe('hr-v1-capi');
  });

  it('clears registrations when the backend disables the feature', () => {
    act(() => setRegisteredClusterSnapshot({ items: registrations }));

    act(() => setRegisteredClusterSnapshot(undefined));

    expect(getClusterRoute('hr-v1-inventory')).toBe('hr-v1-inventory');
    expect(renderRegistrations().result.current).toEqual([]);
  });
});
