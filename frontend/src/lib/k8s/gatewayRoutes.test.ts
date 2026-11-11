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

import GRPCRoute from './grpcRoute';
import HTTPRoute from './httpRoute';
import ReferenceGrant from './referenceGrant';

describe('HTTPRoute', () => {
  it('uses the Gateway API endpoint metadata', () => {
    expect(HTTPRoute.kind).toBe('HTTPRoute');
    expect(HTTPRoute.apiName).toBe('httproutes');
    expect(HTTPRoute.isNamespaced).toBe(true);
    expect(HTTPRoute.apiVersion).toEqual([
      'gateway.networking.k8s.io/v1',
      'gateway.networking.k8s.io/v1beta1',
    ]);
  });

  it('exposes hostnames, rules, and parentRefs when spec is populated', () => {
    const route = new HTTPRoute({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: { name: 'my-route', namespace: 'default' },
      spec: {
        hostnames: ['example.com'],
        parentRefs: [{ name: 'my-gateway' }],
        rules: [{ backendRefs: [{ name: 'my-svc' }] }],
      },
    } as any);

    expect(route.hostnames).toEqual(['example.com']);
    expect(route.parentRefs).toEqual([{ name: 'my-gateway' }]);
    expect(route.rules).toEqual([{ backendRefs: [{ name: 'my-svc' }] }]);
  });

  it('returns empty arrays without throwing when spec is undefined', () => {
    const route = new HTTPRoute({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'HTTPRoute',
      metadata: { name: 'no-spec-route', namespace: 'default' },
    } as any);

    expect(route.hostnames).toEqual([]);
    expect(route.rules).toEqual([]);
    expect(route.parentRefs).toEqual([]);
  });
});

describe('GRPCRoute', () => {
  it('uses the Gateway API endpoint metadata', () => {
    expect(GRPCRoute.kind).toBe('GRPCRoute');
    expect(GRPCRoute.apiName).toBe('grpcroutes');
    expect(GRPCRoute.isNamespaced).toBe(true);
    expect(GRPCRoute.apiVersion).toEqual([
      'gateway.networking.k8s.io/v1',
      'gateway.networking.k8s.io/v1alpha2',
    ]);
  });

  it('exposes hostnames, rules, and parentRefs when spec is populated', () => {
    const route = new GRPCRoute({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'GRPCRoute',
      metadata: { name: 'my-grpc-route', namespace: 'default' },
      spec: {
        hostnames: ['grpc.example.com'],
        parentRefs: [{ name: 'grpc-gateway' }],
        rules: [{ backendRefs: [{ name: 'grpc-svc' }] }],
      },
    } as any);

    expect(route.hostnames).toEqual(['grpc.example.com']);
    expect(route.parentRefs).toEqual([{ name: 'grpc-gateway' }]);
    expect(route.rules).toEqual([{ backendRefs: [{ name: 'grpc-svc' }] }]);
  });

  it('returns empty arrays without throwing when spec is undefined', () => {
    const route = new GRPCRoute({
      apiVersion: 'gateway.networking.k8s.io/v1',
      kind: 'GRPCRoute',
      metadata: { name: 'no-spec-grpc-route', namespace: 'default' },
    } as any);

    expect(route.hostnames).toEqual([]);
    expect(route.rules).toEqual([]);
    expect(route.parentRefs).toEqual([]);
  });
});

describe('ReferenceGrant', () => {
  it('uses the Gateway API endpoint metadata', () => {
    expect(ReferenceGrant.kind).toBe('ReferenceGrant');
    expect(ReferenceGrant.apiName).toBe('referencegrants');
    expect(ReferenceGrant.isNamespaced).toBe(true);
    expect(ReferenceGrant.apiVersion).toEqual([
      'gateway.networking.k8s.io/v1',
      'gateway.networking.k8s.io/v1beta1',
    ]);
  });

  it('exposes from and to arrays when spec is populated', () => {
    const grant = new ReferenceGrant({
      apiVersion: 'gateway.networking.k8s.io/v1beta1',
      kind: 'ReferenceGrant',
      metadata: { name: 'my-grant', namespace: 'default' },
      spec: {
        from: [{ group: 'gateway.networking.k8s.io', kind: 'HTTPRoute', namespace: 'prod' }],
        to: [{ group: '', kind: 'Secret', name: 'app-secret' }],
      },
    } as any);

    expect(grant.from).toHaveLength(1);
    expect(grant.to).toHaveLength(1);
  });

  it('returns empty arrays without throwing when spec is undefined', () => {
    const grant = new ReferenceGrant({
      apiVersion: 'gateway.networking.k8s.io/v1beta1',
      kind: 'ReferenceGrant',
      metadata: { name: 'no-spec-grant', namespace: 'default' },
    } as any);

    expect(grant.from).toEqual([]);
    expect(grant.to).toEqual([]);
  });
});
