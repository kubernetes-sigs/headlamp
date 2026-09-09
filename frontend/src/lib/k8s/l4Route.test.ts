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

import { describe, expect, it, vi } from 'vitest';

vi.mock('../cluster', () => ({
  formatClusterPathParam: vi.fn(),
  getCluster: vi.fn(),
  getSelectedClusters: vi.fn(),
}));
vi.mock('../../helpers/clusterSettings', () => ({ loadClusterSettings: vi.fn() }));
vi.mock('../router/createRouteURL', () => ({ createRouteURL: vi.fn() }));
vi.mock('../util', () => ({ timeAgo: vi.fn() }));
vi.mock('./api/v1/clusterRequests', () => ({ post: vi.fn() }));
vi.mock('./api/v1/factories', () => ({
  apiFactory: vi.fn(),
  apiFactoryWithNamespace: vi.fn(),
}));
vi.mock('./api/v1/hooks', () => ({
  useConnectApi: vi.fn(),
  useSelectedClusters: vi.fn(),
}));
vi.mock('./api/v2/hooks', () => ({ useKubeObject: vi.fn() }));
vi.mock('./api/v2/useKubeObjectList', () => ({
  makeListRequests: vi.fn(),
  useKubeObjectList: vi.fn(),
}));
vi.mock('./patchUtils', () => ({
  computePatchOperations: vi.fn(),
  computeRawPatchCount: vi.fn(),
}));

import TCPRoute from './tcpRoute';
import UDPRoute from './udpRoute';

const routeTypes = [
  [TCPRoute, 'TCPRoute', 'tcproutes'],
  [UDPRoute, 'UDPRoute', 'udproutes'],
] as const;

describe.each(routeTypes)('%s', (Route, kind, apiName) => {
  it('uses the Gateway API endpoint metadata', () => {
    expect(Route.kind).toBe(kind);
    expect(Route.apiName).toBe(apiName);
    expect(Route.isNamespaced).toBe(true);
    expect(Route.apiVersion).toEqual([
      'gateway.networking.k8s.io/v1',
      'gateway.networking.k8s.io/v1alpha2',
    ]);
  });

  it('exposes rules, parent references, and parent status without dropping conditions', () => {
    const parentRef = {
      name: 'edge-gateway',
      namespace: 'networking',
      sectionName: 'tcp',
    };
    const rules = [
      {
        name: 'database',
        backendRefs: [{ name: 'postgres', namespace: 'data', port: 5432, weight: 1 }],
      },
    ];
    const parents = [
      {
        parentRef,
        controllerName: 'example.net/gateway-controller',
        conditions: [
          {
            type: 'Accepted',
            status: 'True',
            lastProbeTime: null,
            reason: 'Accepted',
            message: 'Route is accepted',
          },
        ],
      },
    ];
    const route = new Route({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind,
      metadata: {
        name: 'database-route',
        namespace: 'default',
        creationTimestamp: '2026-08-07T00:00:00Z',
        uid: 'database-route',
      },
      spec: { parentRefs: [parentRef], rules },
      status: { parents },
    });

    expect(route.spec).toEqual({ parentRefs: [parentRef], rules });
    expect(route.rules).toEqual(rules);
    expect(route.parentRefs).toEqual([parentRef]);
    expect(route.parents).toEqual(parents);
  });

  it('returns empty arrays when optional route fields are absent', () => {
    const route = new Route({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind,
      metadata: {
        name: 'empty-route',
        namespace: 'default',
        creationTimestamp: '2026-08-07T00:00:00Z',
        uid: 'empty-route',
      },
      spec: {},
      status: {},
    });

    expect(route.rules).toEqual([]);
    expect(route.parentRefs).toEqual([]);
    expect(route.parents).toEqual([]);
  });
});
