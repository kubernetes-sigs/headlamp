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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NAMESPACE_DISCOVERY_QUERY_KEY } from '../../../lib/k8s/useDiscoveredNamespaces';
import { queryClient } from '../../../lib/queryClient';
import { useClusterSettings } from './useClusterSettings';

describe('useClusterSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('invalidates namespace discovery when allowedNamespaces changes', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useClusterSettings('prod'));

    act(() => {
      result.current[1]({ allowedNamespaces: ['team-a'] });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'prod'], exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [NAMESPACE_DISCOVERY_QUERY_KEY, 'prod'],
      exact: true,
    });
  });

  it('invalidates namespace discovery when defaultNamespace changes', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useClusterSettings('prod'));

    act(() => {
      result.current[1]({ defaultNamespace: 'app' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'prod'], exact: true });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [NAMESPACE_DISCOVERY_QUERY_KEY, 'prod'],
      exact: true,
    });
  });

  it('does not invalidate discovery when unrelated settings change', () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useClusterSettings('prod'));

    act(() => {
      result.current[1]({ currentName: 'display-name' });
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
