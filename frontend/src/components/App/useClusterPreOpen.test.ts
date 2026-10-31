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
import { renderHook } from '@testing-library/react';
import { useClusterPreOpen } from './useClusterPreOpen';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    isSuccess: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}));
vi.mock('react-redux', () => ({ useDispatch: () => dispatch }));
vi.mock('../../lib/k8s', () => ({
  useCluster: () => 'cluster-a',
  useClustersConf: () => ({ 'cluster-a': {} }),
  useSelectedClusters: () => ['cluster-a'],
}));
vi.mock('../../plugin/clusterPreOpen', () => ({
  hasClusterPreOpenHooks: () => true,
  runClusterPreOpenHooks: vi.fn(),
}));
vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: (state: unknown) => unknown) =>
    selector({
      clusterProvider: { preOpenHooksRevision: 1, preparing: {} },
      config: { isDynamicClusterEnabled: false, statelessClusters: null },
    }),
}));

describe('useClusterPreOpen', () => {
  it('runs preparation while React Query is offline', () => {
    renderHook(() => useClusterPreOpen());

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        networkMode: 'always',
      })
    );
  });
});
