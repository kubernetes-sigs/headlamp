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

import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import SectionFilterHeader from './SectionFilterHeader';

vi.mock('../../lib/cluster', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/cluster')>();
  return {
    ...actual,
    getCluster: () => 'test-cluster',
  };
});

vi.mock('./NamespacesAutocomplete', () => ({
  NamespacesAutocomplete: () => null,
}));

vi.mock('./SectionHeader', () => ({
  default: () => null,
}));

function createStore(namespaces: string[]) {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      filter: {
        namespaces: new Set(namespaces),
      },
    },
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        serializableCheck: false,
        thunk: true,
      }),
  });
}

describe('SectionFilterHeader', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('syncs store namespaces from URL when selections differ in one position', async () => {
    const store = createStore(['a', 'c']);

    render(
      <TestContext store={store} urlSearchParams={{ namespace: 'a b' }}>
        <SectionFilterHeader title="Pods" />
      </TestContext>
    );

    await waitFor(() => {
      expect([...store.getState().filter.namespaces].sort()).toEqual(['a', 'b']);
    });
  });

  it('clears global namespace filter state when namespace filtering is disabled on mount', async () => {
    const store = createStore(['a', 'b']);
    localStorage.setItem('headlamp-selected-namespace_test-cluster', JSON.stringify(['a', 'b']));

    render(
      <TestContext store={store} urlPrefix="/c/test-cluster">
        <SectionFilterHeader title="Pods" noNamespaceFilter clearGlobalNamespaceFilterOnMount />
      </TestContext>
    );

    await waitFor(() => {
      expect([...store.getState().filter.namespaces]).toEqual([]);
      expect(localStorage.getItem('headlamp-selected-namespace_test-cluster')).toBe('[]');
    });
  });
});
