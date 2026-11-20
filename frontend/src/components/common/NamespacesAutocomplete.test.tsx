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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { storeClusterSettings } from '../../helpers/clusterSettings';
import { AllowedNamespacesResolutionContext } from '../../lib/k8s/allowedNamespacesContext';
import configReducer from '../../redux/configSlice';
import filterReducer from '../../redux/filterSlice';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

// The namespaces the API returns when some selected cluster has no allow-list.
const apiNamespaces = vi.hoisted(() => ({
  list: [] as { metadata: { name: string } }[],
  error: null as object | null,
  errors: null as { cluster?: string }[] | null,
}));

vi.mock('../../lib/k8s/namespace', () => ({
  default: {
    useList: () =>
      Object.assign([apiNamespaces.list, apiNamespaces.error], { errors: apiNamespaces.errors }),
  },
}));

function makeStore(preloadedState?: object) {
  return configureStore({
    reducer: { filter: filterReducer, config: configReducer } as any,
    preloadedState: preloadedState as any,
  });
}

function tree(path: string, store: ReturnType<typeof makeStore>, resolutionKey = '') {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Provider store={store}>
        <AllowedNamespacesResolutionContext.Provider value={resolutionKey}>
          <MemoryRouter initialEntries={[path]}>
            <NamespacesAutocomplete />
          </MemoryRouter>
        </AllowedNamespacesResolutionContext.Provider>
      </Provider>
    </QueryClientProvider>
  );
}

function renderAt(path: string) {
  return render(tree(path, makeStore()));
}

describe('NamespacesAutocomplete', () => {
  beforeEach(() => {
    localStorage.clear();
    apiNamespaces.list = [];
    apiNamespaces.error = null;
    apiNamespaces.errors = null;
    storeClusterSettings('cluster-a', { allowedNamespaces: ['default'] });
    storeClusterSettings('cluster-b', { allowedNamespaces: ['kube-system'] });
  });

  it.each(['/c/cluster-a+cluster-b/pods', '/c/cluster-b+cluster-a/pods'])(
    'offers the allowed namespaces of every selected cluster (%s)',
    async path => {
      renderAt(path);
      fireEvent.focus(screen.getByRole('combobox'));
      expect(await screen.findByText('default')).toBeInTheDocument();
      expect(await screen.findByText('kube-system')).toBeInTheDocument();
    }
  );

  it.each(['/c/cluster-a+cluster-b/pods', '/c/cluster-b+cluster-a/pods'])(
    'merges API and allowed namespaces when one selected cluster is unrestricted (%s)',
    async path => {
      // cluster-a is restricted to "default"; cluster-b has no allow-list, so its
      // namespaces come from the API, which does not return cluster-a's "default".
      localStorage.clear();
      storeClusterSettings('cluster-a', { allowedNamespaces: ['default'] });
      apiNamespaces.list = [{ metadata: { name: 'api-only' } }];

      renderAt(path);
      fireEvent.focus(screen.getByRole('combobox'));
      expect(await screen.findByText('api-only')).toBeInTheDocument();
      expect(await screen.findByText('default')).toBeInTheDocument();
    }
  );

  it('offers newly allowed namespaces when the resolution key changes', async () => {
    const store = makeStore();
    const path = '/c/cluster-a+cluster-b/pods';
    const view = render(tree(path, store, 'v1'));
    fireEvent.focus(screen.getByRole('combobox'));
    expect(await screen.findByText('kube-system')).toBeInTheDocument();

    storeClusterSettings('cluster-b', { allowedNamespaces: ['kube-system', 'newly-allowed'] });
    view.rerender(tree(path, store, 'v2'));

    expect(await screen.findByText('newly-allowed')).toBeInTheDocument();
  });

  it('keeps the allowed namespaces instead of the kubeconfig default when the API fails', async () => {
    // cluster-a is restricted to "team-a"; cluster-b has no allow-list, so the API
    // is queried and fails.
    localStorage.clear();
    storeClusterSettings('cluster-a', { allowedNamespaces: ['team-a'] });
    apiNamespaces.error = new Error('forbidden');
    const store = makeStore({
      config: {
        clusters: { 'cluster-a': { name: 'cluster-a', meta_data: { namespace: 'default' } } },
      },
    });

    // useCluster reads the cluster from the browser URL, not from the router.
    window.history.pushState({}, '', '/c/cluster-a+cluster-b/pods');
    try {
      render(tree('/c/cluster-a+cluster-b/pods', store));
      fireEvent.focus(screen.getByRole('combobox'));

      expect(await screen.findByText('team-a')).toBeInTheDocument();
      expect([...store.getState().filter.namespaces]).toEqual([]);
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it.each(['/c/cluster-b+cluster-a/pods', '/c/cluster-a+cluster-b/pods'])(
    'offers the kubeconfig namespace of an unrestricted cluster when listing fails (%s)',
    async path => {
      // cluster-a is restricted to "team-a"; cluster-b has no allow-list, its namespace
      // list is forbidden, and its kubeconfig sets "b-default".
      localStorage.clear();
      storeClusterSettings('cluster-a', { allowedNamespaces: ['team-a'] });
      apiNamespaces.error = new Error('forbidden');
      const store = makeStore({
        config: {
          clusters: {
            'cluster-a': { name: 'cluster-a', meta_data: { namespace: 'default' } },
            'cluster-b': { name: 'cluster-b', meta_data: { namespace: 'b-default' } },
          },
        },
      });

      window.history.pushState({}, '', path);
      try {
        render(tree(path, store));
        fireEvent.focus(screen.getByRole('combobox'));

        expect(await screen.findByText('team-a')).toBeInTheDocument();
        expect(await screen.findByText('b-default')).toBeInTheDocument();
        expect(screen.queryByText('default')).not.toBeInTheDocument();
        expect([...store.getState().filter.namespaces]).toEqual([]);
      } finally {
        window.history.pushState({}, '', '/');
      }
    }
  );
  it.each(['/c/cluster-b+cluster-c/pods', '/c/cluster-c+cluster-b/pods'])(
    'offers the kubeconfig namespace of a failed unrestricted cluster next to other results (%s)',
    async path => {
      // cluster-b and cluster-c have no allow-list. cluster-c lists "c-api", cluster-b's list
      // is forbidden and its kubeconfig sets "b-default".
      localStorage.clear();
      apiNamespaces.list = [{ metadata: { name: 'c-api' } }];
      apiNamespaces.error = new Error('forbidden');
      apiNamespaces.errors = [{ cluster: 'cluster-b' }];
      const store = makeStore({
        config: {
          clusters: {
            'cluster-b': { name: 'cluster-b', meta_data: { namespace: 'b-default' } },
            'cluster-c': { name: 'cluster-c', meta_data: { namespace: 'c-default' } },
          },
        },
      });

      window.history.pushState({}, '', path);
      try {
        render(tree(path, store));
        fireEvent.focus(screen.getByRole('combobox'));

        expect(await screen.findByText('c-api')).toBeInTheDocument();
        expect(await screen.findByText('b-default')).toBeInTheDocument();
        expect(screen.queryByText('c-default')).not.toBeInTheDocument();
      } finally {
        window.history.pushState({}, '', '/');
      }
    }
  );
});
