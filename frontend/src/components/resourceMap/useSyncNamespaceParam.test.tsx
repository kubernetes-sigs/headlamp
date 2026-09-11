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
import { renderHook } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';
import { Provider } from 'react-redux';
import { Router } from 'react-router-dom';
import filterReducer, { initialState as FILTER_INITIAL_STATE } from '../../redux/filterSlice';
import { useSyncNamespaceParam } from './useSyncNamespaceParam';

describe('useSyncNamespaceParam', () => {
  const STORAGE_KEY = 'headlamp-selected-namespace_test-cluster';

  beforeEach(() => {
    localStorage.clear();
  });

  function createTestStore(initialNamespaces: string[] = []) {
    return configureStore({
      reducer: {
        filter: filterReducer,
      },
      preloadedState: {
        filter: {
          ...FILTER_INITIAL_STATE,
          namespaces: new Set(initialNamespaces),
        },
      },
      middleware: getDefaultMiddleware =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
    });
  }

  function createWrapper(store: ReturnType<typeof createTestStore>, initialPath: string) {
    const history = createMemoryHistory({ initialEntries: [initialPath] });
    window.history.pushState({}, '', initialPath);

    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <Provider store={store}>
          <Router history={history}>{children}</Router>
        </Provider>
      );
    };
  }

  it('should preserve existing namespace filter in store and localStorage when query param is absent', () => {
    const store = createTestStore(['kube-system']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kube-system']));

    const wrapper = createWrapper(store, '/c/test-cluster/map');
    renderHook(() => useSyncNamespaceParam(), { wrapper });

    expect(store.getState().filter.namespaces).toEqual(new Set(['kube-system']));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['kube-system']));
  });

  it('should update namespace filter in store and localStorage when query param is present', () => {
    const store = createTestStore(['default']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['default']));

    const wrapper = createWrapper(store, '/c/test-cluster/map?namespace=kube-system');
    renderHook(() => useSyncNamespaceParam(), { wrapper });

    expect(store.getState().filter.namespaces).toEqual(new Set(['kube-system']));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['kube-system']));
  });

  it('should handle multiple space-separated namespaces in query param', () => {
    const store = createTestStore([]);

    const wrapper = createWrapper(store, '/c/test-cluster/map?namespace=default+kube-system');
    renderHook(() => useSyncNamespaceParam(), { wrapper });

    expect(store.getState().filter.namespaces).toEqual(new Set(['default', 'kube-system']));
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(['default', 'kube-system']));
  });

  it('should reset filter when namespace query param is explicitly empty', () => {
    const store = createTestStore(['kube-system']);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['kube-system']));

    const wrapper = createWrapper(store, '/c/test-cluster/map?namespace=');
    renderHook(() => useSyncNamespaceParam(), { wrapper });

    expect(store.getState().filter.namespaces).toEqual(new Set());
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify([]));
  });
});
