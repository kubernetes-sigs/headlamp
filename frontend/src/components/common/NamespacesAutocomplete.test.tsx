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
import configReducer from '../../redux/configSlice';
import filterReducer from '../../redux/filterSlice';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

// The namespaces the API returns when some selected cluster has no allow-list.
const apiNamespaces = vi.hoisted(() => ({ list: [] as { metadata: { name: string } }[] }));

vi.mock('../../lib/k8s/namespace', () => ({
  default: { useList: () => [apiNamespaces.list, null] },
}));

function renderAt(path: string) {
  const store = configureStore({
    reducer: { filter: filterReducer, config: configReducer } as any,
  });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Provider store={store}>
        <MemoryRouter initialEntries={[path]}>
          <NamespacesAutocomplete />
        </MemoryRouter>
      </Provider>
    </QueryClientProvider>
  );
}

describe('NamespacesAutocomplete', () => {
  beforeEach(() => {
    localStorage.clear();
    apiNamespaces.list = [];
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
});
