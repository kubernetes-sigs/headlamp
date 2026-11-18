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
import { afterEach, expect, it } from 'vitest';
import { loadClusterSettings, storeClusterSettings } from '../../../helpers/clusterSettings';
import { notifyClusterTagsChanged } from '../../../helpers/clusterTags';
import { useClusterSettings } from './useClusterSettings';

afterEach(() => localStorage.clear());

it.each(['storage', 'same-window', 'clear'])(
  'refreshes only tag overrides on %s changes',
  event => {
    storeClusterSettings('a', {
      tags: { env: 'old' },
      defaultNamespace: 'draft',
      appearance: { icon: 'mdi:cloud' },
    });
    const { result } = renderHook(() => useClusterSettings('a'));
    act(() => {
      if (event === 'clear') {
        localStorage.clear();
        window.dispatchEvent(new StorageEvent('storage', { key: null }));
      } else {
        storeClusterSettings('a', {
          defaultNamespace: 'other-tab',
          appearance: { icon: 'mdi:new' },
        });
        if (event === 'storage') {
          window.dispatchEvent(new StorageEvent('storage', { key: 'cluster_settings.a' }));
        } else {
          notifyClusterTagsChanged();
        }
      }
    });
    expect(result.current[0]).toEqual({
      defaultNamespace: 'draft',
      appearance: { icon: 'mdi:cloud' },
    });
    act(() => result.current[1](previous => ({ ...previous, defaultNamespace: 'next' })));
    expect(loadClusterSettings('a').tags).toBeUndefined();
    expect(loadClusterSettings('a').defaultNamespace).toBe('next');
  }
);

it('does not resurrect stale tags when another setting is saved before the storage event', () => {
  storeClusterSettings('a', { tags: { env: 'old' }, defaultNamespace: 'draft' });
  const { result } = renderHook(() => useClusterSettings('a'));
  storeClusterSettings('a', { tags: { env: 'new' } });
  act(() => result.current[1](previous => ({ ...previous, defaultNamespace: 'next' })));
  expect(result.current[0].tags).toEqual({ env: 'new' });
  expect(loadClusterSettings('a').tags).toEqual({ env: 'new' });
});

it.each<Record<string, string> | undefined>([undefined, {}, { env: 'prod', team: 'platform' }])(
  'preserves settings identity for an unchanged tag map %j',
  tags => {
    storeClusterSettings('a', { tags, currentName: 'saved' });
    const { result } = renderHook(() => useClusterSettings('a'));
    const original = result.current[0];
    act(() => {
      storeClusterSettings('other', { tags: { env: 'new' } });
      notifyClusterTagsChanged();
      if (tags) {
        storeClusterSettings('a', { tags: Object.fromEntries(Object.entries(tags).reverse()) });
      }
      window.dispatchEvent(new StorageEvent('storage', { key: 'cluster_settings.a' }));
    });
    expect(result.current[0]).toBe(original);
  }
);
