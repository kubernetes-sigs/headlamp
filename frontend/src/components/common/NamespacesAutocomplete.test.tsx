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
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { storeClusterSettings } from '../../helpers/clusterSettings';
import filterReducer from '../../redux/filterSlice';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

function renderAt(path: string) {
  const store = configureStore({ reducer: { filter: filterReducer } as any });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <NamespacesAutocomplete />
      </MemoryRouter>
    </Provider>
  );
}

describe('NamespacesAutocomplete', () => {
  beforeEach(() => {
    localStorage.clear();
    storeClusterSettings('cluster-a', { allowedNamespaces: ['default'] });
    storeClusterSettings('cluster-b', { allowedNamespaces: ['kube-system'] });
  });

  it.each(['/c/cluster-a+cluster-b/pods', '/c/cluster-b+cluster-a/pods'])(
    'offers the allowed namespaces of every selected cluster (%s)',
    path => {
      renderAt(path);
      fireEvent.focus(screen.getByRole('combobox'));
      expect(screen.getByText('default')).toBeInTheDocument();
      expect(screen.getByText('kube-system')).toBeInTheDocument();
    }
  );
});
