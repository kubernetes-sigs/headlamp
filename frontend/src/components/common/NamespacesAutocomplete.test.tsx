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
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import Namespace from '../../lib/k8s/namespace';
import filterReducer, { setNamespaceFilter } from '../../redux/filterSlice';
import { NamespacesAutocomplete, PureNamespacesAutocomplete } from './NamespacesAutocomplete';

vi.mock('../../lib/k8s/namespace', () => ({
  __esModule: true,
  default: {
    useList: vi.fn(),
  },
}));

vi.mock('../../lib/k8s', () => ({
  useCluster: () => 'test-cluster',
  useClustersConf: () => ({}),
}));

const mockLoadClusterSettings = vi.fn();
vi.mock('../../helpers/clusterSettings', () => ({
  loadClusterSettings: (...args: any[]) => mockLoadClusterSettings(...args),
}));

describe('NamespacesAutocomplete', () => {
  beforeEach(() => {
    mockLoadClusterSettings.mockReturnValue({});
    vi.mocked(Namespace.useList).mockReturnValue({
      items: [],
      error: null,
      isLoading: false,
    } as unknown as ReturnType<typeof Namespace.useList>);
  });

  it('renders PureNamespacesAutocomplete when allowedNamespaces are set in cluster settings', async () => {
    mockLoadClusterSettings.mockReturnValue({
      allowedNamespaces: ['allowed-ns-1', 'allowed-ns-2'],
    });

    const store = configureStore({
      reducer: {
        filter: filterReducer,
      },
    });

    const { getByLabelText } = render(
      <Provider store={store}>
        <MemoryRouter>
          <NamespacesAutocomplete />
        </MemoryRouter>
      </Provider>
    );

    expect(getByLabelText('Namespaces')).toBeDefined();
  });

  it('renders PureNamespacesAutocomplete correctly with options', () => {
    const filter = { namespaces: new Set(['default']) };
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <PureNamespacesAutocomplete
        namespaceNames={['default', 'kube-system']}
        onChange={onChange}
        filter={filter}
      />
    );
    expect(getByLabelText('Namespaces')).toBeDefined();
  });

  it('clears stale namespaces from filter state when cluster namespaces load', async () => {
    const store = configureStore({
      reducer: {
        filter: filterReducer,
      },
    });

    // Set initial filter with a stale namespace and a valid namespace
    store.dispatch(setNamespaceFilter(['stale-namespace', 'default']));

    // Mock Namespace.useList to return only 'default' namespace
    vi.mocked(Namespace.useList).mockReturnValue({
      items: [{ metadata: { name: 'default' } }],
      error: null,
      isLoading: false,
    } as unknown as ReturnType<typeof Namespace.useList>);

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NamespacesAutocomplete />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      const state = store.getState().filter;
      expect(Array.from(state.namespaces)).toEqual(['default']);
    });
  });

  it('clears stale namespaces from filter state when loaded namespace list is empty', async () => {
    const store = configureStore({
      reducer: {
        filter: filterReducer,
      },
    });

    // Set initial filter with a stale namespace
    store.dispatch(setNamespaceFilter(['stale-namespace']));

    // Mock Namespace.useList to return an empty array with no error
    vi.mocked(Namespace.useList).mockReturnValue({
      items: [],
      error: null,
      isLoading: false,
    } as unknown as ReturnType<typeof Namespace.useList>);

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NamespacesAutocomplete />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      const state = store.getState().filter;
      expect(Array.from(state.namespaces)).toEqual([]);
    });
  });

  it('does not clear selected namespaces while namespace list is loading', () => {
    const store = configureStore({
      reducer: {
        filter: filterReducer,
      },
    });

    store.dispatch(setNamespaceFilter(['my-namespace']));

    vi.mocked(Namespace.useList).mockReturnValue({
      items: [],
      error: null,
      isLoading: true,
    } as unknown as ReturnType<typeof Namespace.useList>);

    render(
      <Provider store={store}>
        <MemoryRouter>
          <NamespacesAutocomplete />
        </MemoryRouter>
      </Provider>
    );

    const state = store.getState().filter;
    expect(Array.from(state.namespaces)).toEqual(['my-namespace']);
  });
});
