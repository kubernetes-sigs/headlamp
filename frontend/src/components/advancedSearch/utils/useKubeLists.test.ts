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

import { renderHook } from '@testing-library/react';
import { useKubeLists } from './useKubeLists';

const { mockUseList } = vi.hoisted(() => ({
  mockUseList: vi.fn(),
}));

vi.mock('../../../redux/filterSlice', () => ({
  default: (state = {}) => state,
  useNamespaces: () => ['default'],
}));

vi.mock('../../../lib/k8s/cluster', () => ({
  KubeObject: class KubeObject {},
  makeKubeObject: vi.fn(),
}));

vi.mock('../../../lib/k8s', () => ({
  KubeObject: class KubeObject {},
  ResourceClasses: {
    Pod: {
      useList: (...args: any[]) => mockUseList(...args),
    },
  },
}));

describe('useKubeLists', () => {
  const mockResources = [
    {
      kind: 'Pod',
      apiVersion: 'v1',
      pluralName: 'pods',
      isNamespaced: true,
      singularName: 'pod',
    },
  ] as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retains items when total items exactly equal maxItems', () => {
    const maxItems = 2;
    const mockItems = [{ metadata: { name: 'pod-1' } }, { metadata: { name: 'pod-2' } }];

    mockUseList.mockReturnValue({
      items: mockItems,
      isLoading: false,
    });

    const { result } = renderHook(() => useKubeLists(mockResources, ['main-cluster'], maxItems));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items).toEqual(mockItems);
  });

  it('discards items when total items exceed maxItems limit', () => {
    const maxItems = 2;
    const mockItems = [
      { metadata: { name: 'pod-1' } },
      { metadata: { name: 'pod-2' } },
      { metadata: { name: 'pod-3' } },
    ];

    mockUseList.mockReturnValue({
      items: mockItems,
      isLoading: false,
    });

    const { result } = renderHook(() => useKubeLists(mockResources, ['main-cluster'], maxItems));

    expect(result.current.items).toHaveLength(0);
  });
});
