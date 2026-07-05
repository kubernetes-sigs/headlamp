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
import { renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the k8s barrel, event module, Redux store, and router functions to prevent circular initialization issues.
// KubeObject.ts imports createRouteURL, which imports getRoutePath, which imports
// router/index, which imports deployment.ts and loads all resources.
vi.mock('.', () => ({}));
vi.mock('./event', () => ({}));
vi.mock('../router/createRouteURL', () => ({
  createRouteURL: vi.fn(),
}));
vi.mock('../../redux/stores/store', () => ({
  default: {
    getState: () => ({}),
    dispatch: () => {},
    subscribe: () => () => {},
  },
}));

// Mock dependencies before importing the hooks under test.
const mockUseKubeObjectList = vi.fn().mockReturnValue({
  data: null,
  items: null,
  error: null,
  isError: false,
  isLoading: true,
  isFetching: true,
  isSuccess: false,
  status: 'pending',
  clusterResults: {},
  errors: null,
});
const mockMakeListRequests = vi.fn().mockReturnValue([{ cluster: '', namespaces: [] }]);

vi.mock('./api/v2/useKubeObjectList', () => ({
  useKubeObjectList: (...args: any[]) => mockUseKubeObjectList(...args),
  makeListRequests: (...args: any[]) => mockMakeListRequests(...args),
}));

const mockUseKubeObject = vi.fn().mockReturnValue(
  Object.assign([null, null], {
    data: null,
    error: null,
    isError: false,
    isLoading: true,
    isFetching: true,
    isSuccess: false,
    status: 'pending',
  })
);

vi.mock('./api/v2/hooks', () => ({
  useKubeObject: (...args: any[]) => mockUseKubeObject(...args),
}));

const mockUseConnectApi = vi.fn();
const mockUseSelectedClusters = vi.fn().mockReturnValue(['test-cluster']);

vi.mock('./api/v1/hooks', () => ({
  useConnectApi: (...args: any[]) => mockUseConnectApi(...args),
  useSelectedClusters: (...args: any[]) => mockUseSelectedClusters(...args),
}));

import { useKubeApiGet, useKubeApiList, useKubeGet, useKubeList } from './KubeObject';

// A minimal mock class that satisfies the KubeObject type constraints
const MockKubeClass = class {
  static apiVersion = 'v1';
  static apiName = 'pods';
  static kind = 'Pod';
  static isNamespaced = true;

  static apiEndpoint = {
    apiInfo: [{ group: '', resource: 'pods', version: 'v1' }],
  };

  static apiList = vi.fn().mockReturnValue(() => Promise.resolve(() => {}));
  static apiGet = vi.fn().mockReturnValue(() => Promise.resolve(() => {}));

  constructor(public jsonData: any) {}
} as any;

const MockClusterScopedClass = class {
  static apiVersion = 'v1';
  static apiName = 'nodes';
  static kind = 'Node';
  static isNamespaced = false;

  static apiEndpoint = {
    apiInfo: [{ group: '', resource: 'nodes', version: 'v1' }],
  };

  static apiList = vi.fn().mockReturnValue(() => Promise.resolve(() => {}));
  static apiGet = vi.fn().mockReturnValue(() => Promise.resolve(() => {}));

  constructor(public jsonData: any) {}
} as any;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useKubeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSelectedClusters.mockReturnValue(['test-cluster']);
  });

  it('should call makeListRequests and useKubeObjectList with correct params', () => {
    renderHook(() => useKubeList(MockKubeClass, { namespace: 'default' }), {
      wrapper: createWrapper(),
    });

    expect(mockMakeListRequests).toHaveBeenCalled();
    expect(mockUseKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({
        kubeObjectClass: MockKubeClass,
      })
    );
  });

  it('should use the provided cluster when specified', () => {
    renderHook(() => useKubeList(MockKubeClass, { cluster: 'my-cluster' }), {
      wrapper: createWrapper(),
    });

    expect(mockMakeListRequests).toHaveBeenCalledWith(
      ['my-cluster'],
      expect.any(Function),
      true,
      undefined
    );
  });

  it('should use the provided clusters array when specified', () => {
    renderHook(() => useKubeList(MockKubeClass, { clusters: ['cluster-a', 'cluster-b'] }), {
      wrapper: createWrapper(),
    });

    expect(mockMakeListRequests).toHaveBeenCalledWith(
      ['cluster-a', 'cluster-b'],
      expect.any(Function),
      true,
      undefined
    );
  });

  it('should fall back to selected clusters when no cluster is specified', () => {
    mockUseSelectedClusters.mockReturnValue(['fallback-a', 'fallback-b']);

    renderHook(() => useKubeList(MockKubeClass, {}), {
      wrapper: createWrapper(),
    });

    expect(mockMakeListRequests).toHaveBeenCalledWith(
      ['fallback-a', 'fallback-b'],
      expect.any(Function),
      true,
      undefined
    );
  });

  it('should handle a single namespace string', () => {
    renderHook(() => useKubeList(MockKubeClass, { namespace: 'kube-system' }), {
      wrapper: createWrapper(),
    });

    expect(mockMakeListRequests).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Function),
      true,
      ['kube-system']
    );
  });

  it('should handle a namespace array', () => {
    renderHook(() => useKubeList(MockKubeClass, { namespace: ['ns-a', 'ns-b'] }), {
      wrapper: createWrapper(),
    });

    expect(mockMakeListRequests).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Function),
      true,
      ['ns-a', 'ns-b']
    );
  });

  it('should pass refetchInterval to useKubeObjectList', () => {
    renderHook(() => useKubeList(MockKubeClass, { refetchInterval: 5000 }), {
      wrapper: createWrapper(),
    });

    expect(mockUseKubeObjectList).toHaveBeenCalledWith(
      expect.objectContaining({
        refetchInterval: 5000,
      })
    );
  });
});

describe('useKubeGet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delegate to useKubeObject with correct params', () => {
    renderHook(() => useKubeGet(MockKubeClass, 'my-pod', 'default'), {
      wrapper: createWrapper(),
    });

    expect(mockUseKubeObject).toHaveBeenCalledWith({
      kubeObjectClass: MockKubeClass,
      name: 'my-pod',
      namespace: 'default',
      cluster: undefined,
      queryParams: undefined,
    });
  });

  it('should pass optional cluster and queryParams', () => {
    renderHook(
      () =>
        useKubeGet(MockKubeClass, 'my-pod', 'default', {
          cluster: 'my-cluster',
          queryParams: { labelSelector: 'app=test' },
        }),
      { wrapper: createWrapper() }
    );

    expect(mockUseKubeObject).toHaveBeenCalledWith({
      kubeObjectClass: MockKubeClass,
      name: 'my-pod',
      namespace: 'default',
      cluster: 'my-cluster',
      queryParams: { labelSelector: 'app=test' },
    });
  });

  it('should work without namespace for cluster-scoped resources', () => {
    renderHook(() => useKubeGet(MockClusterScopedClass, 'my-node'), {
      wrapper: createWrapper(),
    });

    expect(mockUseKubeObject).toHaveBeenCalledWith({
      kubeObjectClass: MockClusterScopedClass,
      name: 'my-node',
      namespace: undefined,
      cluster: undefined,
      queryParams: undefined,
    });
  });
});

describe('useKubeApiList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockKubeClass.apiList.mockReturnValue(() => Promise.resolve(() => {}));
    MockClusterScopedClass.apiList.mockReturnValue(() => Promise.resolve(() => {}));
  });

  it('should call useConnectApi', () => {
    const onList = vi.fn();

    renderHook(() => useKubeApiList(MockClusterScopedClass, onList), {
      wrapper: createWrapper(),
    });

    expect(mockUseConnectApi).toHaveBeenCalled();
  });

  it('should create a single API call for cluster-scoped resources', () => {
    const onList = vi.fn();

    renderHook(() => useKubeApiList(MockClusterScopedClass, onList), {
      wrapper: createWrapper(),
    });

    expect(MockClusterScopedClass.apiList).toHaveBeenCalledTimes(1);
    expect(MockClusterScopedClass.apiList).toHaveBeenCalledWith(
      onList,
      undefined,
      expect.objectContaining({ cluster: undefined })
    );
  });

  it('should create per-namespace API calls for namespaced resources with explicit namespaces', () => {
    const onList = vi.fn();

    renderHook(
      () =>
        useKubeApiList(MockKubeClass, onList, undefined, {
          namespace: ['ns-a', 'ns-b'],
        }),
      { wrapper: createWrapper() }
    );

    expect(MockKubeClass.apiList).toHaveBeenCalledTimes(2);
    expect(MockKubeClass.apiList).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      expect.objectContaining({ namespace: 'ns-a' })
    );
    expect(MockKubeClass.apiList).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      expect.objectContaining({ namespace: 'ns-b' })
    );
  });

  it('should handle a single namespace string', () => {
    const onList = vi.fn();

    renderHook(
      () =>
        useKubeApiList(MockKubeClass, onList, undefined, {
          namespace: 'kube-system',
        }),
      { wrapper: createWrapper() }
    );

    expect(MockKubeClass.apiList).toHaveBeenCalledTimes(1);
    expect(MockKubeClass.apiList).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      expect.objectContaining({ namespace: 'kube-system' })
    );
  });

  it('should pass cluster option through', () => {
    const onList = vi.fn();

    renderHook(
      () =>
        useKubeApiList(MockKubeClass, onList, undefined, {
          namespace: 'default',
          cluster: 'my-cluster',
        }),
      { wrapper: createWrapper() }
    );

    expect(MockKubeClass.apiList).toHaveBeenCalledWith(
      expect.any(Function),
      undefined,
      expect.objectContaining({ cluster: 'my-cluster' })
    );
  });

  it('should pass the error callback', () => {
    const onList = vi.fn();
    const onError = vi.fn();

    renderHook(() => useKubeApiList(MockClusterScopedClass, onList, onError), {
      wrapper: createWrapper(),
    });

    expect(MockClusterScopedClass.apiList).toHaveBeenCalledWith(
      onList,
      onError,
      expect.any(Object)
    );
  });
});

describe('useKubeApiGet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockKubeClass.apiGet.mockReturnValue(() => Promise.resolve(() => {}));
  });

  it('should call useConnectApi with apiGet result', () => {
    const onGet = vi.fn();

    renderHook(() => useKubeApiGet(MockKubeClass, onGet, 'my-pod', 'default'), {
      wrapper: createWrapper(),
    });

    expect(MockKubeClass.apiGet).toHaveBeenCalledWith(
      onGet,
      'my-pod',
      'default',
      undefined,
      undefined
    );
    expect(mockUseConnectApi).toHaveBeenCalled();
  });

  it('should pass error callback and options', () => {
    const onGet = vi.fn();
    const onError = vi.fn();
    const opts = { cluster: 'my-cluster', queryParams: { labelSelector: 'app=test' } };

    renderHook(() => useKubeApiGet(MockKubeClass, onGet, 'my-pod', 'default', onError, opts), {
      wrapper: createWrapper(),
    });

    expect(MockKubeClass.apiGet).toHaveBeenCalledWith(onGet, 'my-pod', 'default', onError, opts);
  });

  it('should work without namespace for cluster-scoped resources', () => {
    const onGet = vi.fn();

    renderHook(() => useKubeApiGet(MockClusterScopedClass, onGet, 'my-node', undefined), {
      wrapper: createWrapper(),
    });

    expect(MockClusterScopedClass.apiGet).toHaveBeenCalledWith(
      onGet,
      'my-node',
      undefined,
      undefined,
      undefined
    );
  });
});
