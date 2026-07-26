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
import { act, renderHook, waitFor } from '@testing-library/react';
import App from '../../../../App';
import { useCluster, useSelectedClusters } from '../../../../lib/k8s';
import ConfigMap from '../../../../lib/k8s/configMap';
import CRD from '../../../../lib/k8s/crd';
import Pod from '../../../../lib/k8s/pod';
import VPA from '../../../../lib/k8s/vpa';
import { useNamespaces } from '../../../../redux/filterSlice';
import { GraphSource } from '../../graph/graphModel';
import { useGetAllSources } from './sources';

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: vi.fn(),
}));
vi.mock('../../../../lib/k8s/api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../lib/k8s/api/v1/hooks')>()),
  useCluster: vi.fn(),
  useSelectedClusters: vi.fn(),
}));
vi.mock('../../../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../redux/filterSlice')>()),
  useNamespaces: vi.fn(),
}));

// Initialize the complete Kubernetes class registry before loading source definitions.
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const findGroup = (sources: GraphSource[], id: string) =>
  sources.find(source => source.id === id && 'sources' in source) as Extract<
    GraphSource,
    { sources: GraphSource[] }
  >;

const findLeaf = (
  sources: GraphSource[],
  id: string
): Extract<GraphSource, { useData: () => unknown }> | undefined => {
  for (const source of sources) {
    if ('sources' in source) {
      const leaf = findLeaf(source.sources, id);
      if (leaf) return leaf;
    } else if (source.id === id) {
      return source;
    }
  }
  return undefined;
};

const crd = (kind: string, group: string, apiName: string) =>
  ({
    spec: { names: { kind } },
    getMainAPIGroup: () => [group, 'v1', apiName],
    makeCRClass: () =>
      class CustomResource {
        static apiName = apiName;
        static apiVersion = `${group}/v1`;
        static kind = kind;
        static get apiGroupName() {
          return group;
        }
        static useList = vi.fn(() => [null]);
      },
  } as unknown as CRD);

describe('useGetAllSources', () => {
  beforeEach(() => {
    vi.mocked(useNamespaces).mockReturnValue(['namespace-a']);
    vi.mocked(useCluster).mockReturnValue('cluster-a');
    vi.mocked(useSelectedClusters).mockReturnValue(['cluster-a']);
    vi.mocked(useQuery).mockReturnValue({
      data: [],
    } as ReturnType<typeof useQuery>);
    vi.spyOn(CRD, 'useList').mockReturnValue({ items: null } as ReturnType<typeof CRD.useList>);
    vi.spyOn(VPA, 'isEnabled').mockResolvedValue(false);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns built-in groups with their default selection settings', () => {
    const { result } = renderHook(() => useGetAllSources());

    expect(result.current.map(source => source.id)).toEqual([
      'workloads',
      'storage',
      'cluster',
      'network',
      'security',
      'configuration',
    ]);
    expect(findGroup(result.current, 'cluster').isEnabledByDefault).toBe(false);
    expect(findGroup(result.current, 'security').isEnabledByDefault).toBe(false);
    expect(findGroup(result.current, 'configuration').isEnabledByDefault).toBe(false);
    expect(findLeaf(result.current, 'Pod')).toBeDefined();
  });

  it('loads leaf data as null and then converts Kubernetes objects to graph nodes', () => {
    const pod = new Pod({ metadata: { uid: 'pod-1', name: 'pod-1' } } as any, 'cluster-a');
    const useList = vi.spyOn(Pod, 'useList').mockReturnValue([null] as any);
    const { result: sources } = renderHook(() => useGetAllSources());
    const podSource = findLeaf(sources.current, 'Pod')! as Extract<
      GraphSource,
      { useData: () => unknown }
    >;
    const { result, rerender } = renderHook(() => podSource.useData());

    expect(result.current).toBeNull();
    expect(useList).toHaveBeenCalledWith({ namespace: ['namespace-a'] });

    useList.mockReturnValue([[pod]] as any);
    rerender();

    expect(result.current).toEqual({ nodes: [{ id: 'pod-1', kubeObject: pod }] });
  });

  it('adds Gateway sources only when the API group is discovered', () => {
    vi.mocked(useQuery).mockReturnValue({
      data: [{ groupName: 'gateway.networking.k8s.io' }],
    } as ReturnType<typeof useQuery>);

    const { result } = renderHook(() => useGetAllSources());
    const gateway = findGroup(result.current, 'gateway-beta');

    expect(gateway.isEnabledByDefault).toBe(false);
    expect(gateway.sources.map(source => source.label)).toContain('gateways');
  });

  it('adds VPA after its availability check resolves', async () => {
    vi.spyOn(VPA, 'isEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useGetAllSources());

    await waitFor(() =>
      expect(findLeaf(result.current, 'autoscaling.k8s.io/VerticalPodAutoscaler')).toBeDefined()
    );
  });

  it('ignores a stale VPA availability result after the cluster changes', async () => {
    const resolvers: ((enabled: boolean) => void)[] = [];
    vi.spyOn(VPA, 'isEnabled').mockImplementation(
      () => new Promise(resolve => resolvers.push(resolve))
    );
    const { result, rerender } = renderHook(() => useGetAllSources());

    vi.mocked(useCluster).mockReturnValue('cluster-b');
    rerender();
    await act(async () => resolvers[0](true));

    expect(findLeaf(result.current, 'autoscaling.k8s.io/VerticalPodAutoscaler')).toBeUndefined();
  });

  it('groups custom resources and filters built-ins according to VPA availability', async () => {
    vi.spyOn(CRD, 'useList').mockReturnValue({
      items: [
        crd('Widget', 'example.io', 'widgets'),
        crd('Gadget', 'example.io', 'gadgets'),
        crd('Gateway', 'gateway.networking.k8s.io', 'gateways'),
        crd('VerticalPodAutoscaler', 'autoscaling.k8s.io', 'verticalpodautoscalers'),
      ],
    } as unknown as ReturnType<typeof CRD.useList>);
    vi.spyOn(VPA, 'isEnabled').mockResolvedValue(true);
    const { result } = renderHook(() => useGetAllSources());

    await waitFor(() =>
      expect(findLeaf(result.current, 'autoscaling.k8s.io/VerticalPodAutoscaler')).toBeDefined()
    );
    const customResources = findGroup(result.current, 'customresource');
    const exampleGroup = findGroup(customResources.sources, 'crd-example.io');

    expect(exampleGroup.sources.map(source => source.id)).toEqual([
      'crd-example.io/Widget',
      'crd-example.io/Gadget',
    ]);
    expect(
      findLeaf(customResources.sources, 'crd-gateway.networking.k8s.io/Gateway')
    ).toBeUndefined();
    expect(
      findLeaf(customResources.sources, 'crd-autoscaling.k8s.io/VerticalPodAutoscaler')
    ).toBeUndefined();
  });

  it('keeps a VPA CRD source when built-in VPA is unavailable', () => {
    vi.spyOn(CRD, 'useList').mockReturnValue({
      items: [crd('VerticalPodAutoscaler', 'autoscaling.k8s.io', 'verticalpodautoscalers')],
    } as unknown as ReturnType<typeof CRD.useList>);

    const { result } = renderHook(() => useGetAllSources());

    expect(findLeaf(result.current, 'crd-autoscaling.k8s.io/VerticalPodAutoscaler')).toBeDefined();
    expect(findGroup(result.current, 'customresource').isEnabledByDefault).toBe(false);
  });

  it('uses stable source identities for representative built-ins', () => {
    const { result } = renderHook(() => useGetAllSources());

    expect(findLeaf(result.current, 'ConfigMap')?.label).toBe(ConfigMap.apiName);
    expect(findLeaf(result.current, 'Pod')?.label).toBe(Pod.apiName);
  });
});
