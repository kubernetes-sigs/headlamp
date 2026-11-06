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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../../helpers/clusterSettings';
import { CLUSTER_TAGS_CHANGED_EVENT, storeClusterTags } from '../../../helpers/clusterTags';
import { useClusterTags } from './useClusterTags';

const CLUSTER_NAMES = ['prod', 'dev'];

/** Writes settings the way another tab would: without notifying this window. */
function writeFromAnotherTab(cluster: string, tags: Record<string, string>) {
  storeClusterSettings(cluster, { tags });
}

function dispatchStorageEvent(key: string | null) {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
}

describe('useClusterTags', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads the tags of the given clusters', () => {
    storeClusterSettings('prod', { tags: { environment: 'production' } });

    const { result } = renderHook(() => useClusterTags(CLUSTER_NAMES));

    expect(result.current).toEqual({ prod: { environment: 'production' }, dev: {} });
  });

  it('reloads when tags are changed in this window', () => {
    const { result } = renderHook(() => useClusterTags(CLUSTER_NAMES));

    act(() => storeClusterTags('dev', { environment: 'development' }));

    expect(result.current.dev).toEqual({ environment: 'development' });
  });

  it('reloads when cluster settings are changed in another tab', () => {
    const { result } = renderHook(() => useClusterTags(CLUSTER_NAMES));

    writeFromAnotherTab('prod', { environment: 'production' });
    dispatchStorageEvent('cluster_settings.prod');

    expect(result.current.prod).toEqual({ environment: 'production' });
  });

  it('reloads when another tab clears the storage', () => {
    storeClusterSettings('prod', { tags: { environment: 'production' } });
    const { result } = renderHook(() => useClusterTags(CLUSTER_NAMES));

    localStorage.clear();
    dispatchStorageEvent(null);

    expect(result.current.prod).toEqual({});
  });

  it('ignores storage changes to other keys', () => {
    const { result } = renderHook(() => useClusterTags(CLUSTER_NAMES));
    const before = result.current;

    writeFromAnotherTab('prod', { environment: 'production' });
    dispatchStorageEvent('table_sorting.home-clusters');

    expect(result.current).toBe(before);
    expect(result.current.prod).toEqual({});
  });

  it('removes its listeners when unmounted', () => {
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useClusterTags(CLUSTER_NAMES));

    const added = addListener.mock.calls.filter(([type]) =>
      [CLUSTER_TAGS_CHANGED_EVENT, 'storage'].includes(type)
    );
    expect(added).toHaveLength(2);

    unmount();

    for (const [type, listener] of added) {
      expect(removeListener).toHaveBeenCalledWith(type, listener);
    }
  });
});
