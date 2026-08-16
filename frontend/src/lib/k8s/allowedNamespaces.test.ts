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
import {
  loadResolvedAllowedNamespaces,
  storeResolvedAllowedNamespaces,
} from '../../helpers/clusterSettings';
import { useAllowedNamespacesFromSelector } from './allowedNamespaces';
import Namespace from './namespace';

// vi.mock is hoisted above the imports by vitest, so Namespace resolves to this mock.
vi.mock('./namespace', () => ({
  default: { useList: vi.fn() },
}));

const mockUseList = Namespace.useList as unknown as ReturnType<typeof vi.fn>;

function ns(name: string) {
  return { metadata: { name } };
}

function mockList(overrides: Record<string, unknown>) {
  mockUseList.mockReturnValue({
    items: null,
    error: null,
    isError: false,
    isFetching: false,
    isSuccess: false,
    ...overrides,
  });
}

describe('useAllowedNamespacesFromSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseList.mockReset();
    mockList({});
  });

  it('does not query and clears the cache when no selector is configured', () => {
    storeResolvedAllowedNamespaces('prod', 'team=frontend', ['a']);

    const { result } = renderHook(() => useAllowedNamespacesFromSelector('prod', ''));

    // The query is disabled: no cluster is passed.
    expect(mockUseList).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: [], labelSelector: undefined })
    );
    expect(loadResolvedAllowedNamespaces('prod')).toBeNull();
    expect(result.current.namespaces).toEqual([]);
  });

  it('caches the resolved namespaces on success, tagged with the selector', () => {
    mockList({ items: [ns('b'), ns('a')], isFetching: false });

    const { result } = renderHook(() => useAllowedNamespacesFromSelector('prod', 'team=frontend'));

    expect(mockUseList).toHaveBeenCalledWith(
      expect.objectContaining({ clusters: ['prod'], labelSelector: 'team=frontend' })
    );
    expect(result.current.namespaces).toEqual(['a', 'b']);
    const cache = loadResolvedAllowedNamespaces('prod');
    expect(cache?.selector).toBe('team=frontend');
    expect(cache?.namespaces).toEqual(['a', 'b']);
  });

  it('reports a successful empty result when the selector matches no namespaces', () => {
    mockList({ items: [], isSuccess: true, isFetching: false });

    const { result } = renderHook(() => useAllowedNamespacesFromSelector('prod', 'team=frontend'));

    expect(result.current.namespaces).toEqual([]);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('clears the cache and surfaces the error on a failed resolution (fail closed)', () => {
    storeResolvedAllowedNamespaces('prod', 'team=frontend', ['stale']);
    const error = new Error('boom');
    mockList({ items: null, isError: true, error });

    const { result } = renderHook(() => useAllowedNamespacesFromSelector('prod', 'team=frontend'));

    expect(loadResolvedAllowedNamespaces('prod')).toBeNull();
    expect(result.current.error).toBe(error);
  });

  it('keeps the existing cache while the resolution is still loading', () => {
    storeResolvedAllowedNamespaces('prod', 'team=frontend', ['keep']);
    mockList({ items: null, isFetching: true });

    const { result } = renderHook(() => useAllowedNamespacesFromSelector('prod', 'team=frontend'));

    expect(loadResolvedAllowedNamespaces('prod')?.namespaces).toEqual(['keep']);
    expect(result.current.isFetching).toBe(true);
  });
});
