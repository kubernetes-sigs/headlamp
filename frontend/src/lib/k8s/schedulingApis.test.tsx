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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import App from '../../App';
import { useSelectedClusters } from './api/v1/hooks';
import PodGroup from './podGroup';
import {
  useListPerVersion,
  usePodGroupClustersByVersion,
  useSchedulingApiClusters,
  useSchedulingApisEnabled,
  withApiVersion,
} from './schedulingApis';

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock('./api/v1/clusterRequests', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/clusterRequests')>()),
  request: mockRequest,
}));

vi.mock('./api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('./api/v1/hooks')>()),
  useSelectedClusters: vi.fn(),
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const V1BETA1 = 'scheduling.k8s.io/v1beta1';
const V1ALPHA3 = 'scheduling.k8s.io/v1alpha3';
const V1ALPHA2 = 'scheduling.k8s.io/v1alpha2';

/** Answers discovery as if each cluster served the scheduling resources under these versions. */
function serve(versionsPerCluster: Record<string, string[]>) {
  mockRequest.mockImplementation(async (path: string, { cluster }: { cluster: string }) => {
    const version = path.replace('/apis/', '');
    if (!versionsPerCluster[cluster]?.includes(version)) {
      throw new Error('404');
    }
    return { resources: [{ name: 'workloads' }, { name: 'podgroups' }] };
  });
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

beforeEach(() => mockRequest.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('usePodGroupClustersByVersion', () => {
  it('groups the serving clusters by the newest version each serves', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'beta', 'both', 'older']);
    serve({ beta: [V1BETA1], both: [V1BETA1, V1ALPHA3], older: [V1ALPHA2] });

    const { result } = renderHook(() => usePodGroupClustersByVersion(), { wrapper });

    await waitFor(() =>
      expect(result.current).toEqual({ [V1BETA1]: ['beta', 'both'], [V1ALPHA2]: ['older'] })
    );
  });

  it('is empty while nothing is selected, without probing', () => {
    vi.mocked(useSelectedClusters).mockReturnValue([]);

    const { result } = renderHook(() => usePodGroupClustersByVersion(), { wrapper });

    expect(result.current).toEqual({});
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe('useSchedulingApiClusters', () => {
  it('keeps the selected clusters that serve the APIs in any version', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'beta', 'older']);
    serve({ beta: [V1BETA1], older: [V1ALPHA2] });

    const { result } = renderHook(() => useSchedulingApiClusters(), { wrapper });

    await waitFor(() => expect(result.current).toEqual(['beta', 'older']));
  });

  it('is empty when no selected cluster serves the APIs', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy']);
    serve({});

    const { result } = renderHook(() => useSchedulingApiClusters(), { wrapper });

    await waitFor(() => expect(mockRequest).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});

describe('useSchedulingApisEnabled', () => {
  it('is true once any selected cluster serves the APIs', async () => {
    vi.mocked(useSelectedClusters).mockReturnValue(['legacy', 'gang']);
    serve({ gang: [V1ALPHA2] });

    const { result } = renderHook(() => useSchedulingApisEnabled(), { wrapper });

    await waitFor(() => expect(result.current).toBe(true));
  });
});

describe('withApiVersion', () => {
  it('declares only the given version and resolves its endpoint without racing', () => {
    const Beta = withApiVersion(PodGroup, V1BETA1);

    expect(Beta.apiVersion).toBe(V1BETA1);
    expect(Beta.kind).toBe('PodGroup');
    expect(Beta.apiEndpoint.apiInfo).toEqual([
      { group: 'scheduling.k8s.io', version: 'v1beta1', resource: 'podgroups' },
    ]);
  });

  it('leaves the class it was made from, and its endpoint, untouched', () => {
    const endpoint = PodGroup.apiEndpoint;

    expect(withApiVersion(PodGroup, V1ALPHA2).apiEndpoint).not.toBe(endpoint);
    expect(PodGroup.apiVersion).toEqual([V1BETA1, V1ALPHA3, V1ALPHA2]);
    expect(PodGroup.apiEndpoint).toBe(endpoint);
  });

  it('returns the same class for the same version', () => {
    expect(withApiVersion(PodGroup, V1ALPHA3)).toBe(withApiVersion(PodGroup, V1ALPHA3));
  });
});

describe('useListPerVersion', () => {
  it('asks each cluster only for the version it serves', () => {
    const useList = vi.spyOn(PodGroup, 'useList').mockReturnValue([[]] as any);

    renderHook(() =>
      useListPerVersion(PodGroup, { [V1BETA1]: ['beta'], [V1ALPHA2]: ['older'] }, ['default'])
    );

    const asked = useList.mock.calls.map((call, index) => [
      (useList.mock.contexts[index] as typeof PodGroup).apiVersion,
      (call[0] as { clusters: string[] }).clusters,
    ]);
    expect(asked).toEqual([
      [V1BETA1, ['beta']],
      [V1ALPHA3, []],
      [V1ALPHA2, ['older']],
    ]);
  });

  it('is null while a version is loading, then holds the items of every version', () => {
    const beta = { metadata: { uid: 'beta' } };
    const older = { metadata: { uid: 'older' } };
    let olderItems: unknown[] | null = null;
    vi.spyOn(PodGroup, 'useList').mockImplementation(function (this: { apiVersion: string }) {
      if (this.apiVersion === V1BETA1) return [[beta]] as any;
      if (this.apiVersion === V1ALPHA2) return [olderItems] as any;
      return [null] as any;
    });
    const clustersByVersion = { [V1BETA1]: ['beta'], [V1ALPHA2]: ['older'] };

    const { result, rerender } = renderHook(() => useListPerVersion(PodGroup, clustersByVersion));

    // The version that no cluster serves never holds the result back; the older one does.
    expect(result.current).toBeNull();

    olderItems = [older];
    rerender();

    expect(result.current).toEqual([beta, older]);
  });
});
