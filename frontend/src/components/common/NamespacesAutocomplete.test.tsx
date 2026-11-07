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

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storeClusterSettings } from '../../helpers/clusterSettings';
import Namespace from '../../lib/k8s/namespace';
import { TestContext } from '../../test';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

/** Makes the namespace list (of all the selected clusters) return these names. */
function listNamespaces(names: string[]) {
  vi.spyOn(Namespace, 'useList').mockReturnValue([
    names.map(name => ({ metadata: { name } })),
    null,
  ] as unknown as ReturnType<typeof Namespace.useList>);
}

/** Renders the filter for the clusters in the URL and returns the namespaces it offers. */
function offeredNamespaces(clusters: string) {
  // Some cluster hooks read the browser's URL rather than the router's, so set both.
  window.history.pushState({}, '', `/c/${clusters}/pods`);
  render(
    <TestContext routerMap={{ cluster: clusters }} urlPrefix="/c">
      <NamespacesAutocomplete />
    </TestContext>
  );
  fireEvent.focus(screen.getByRole('combobox'));
  return screen.getAllByRole('option').map(option => option.textContent);
}

describe('NamespacesAutocomplete', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('offers the allowed namespaces of a cluster that has them', () => {
    storeClusterSettings('cluster-a', { allowedNamespaces: ['team-a', 'default'] });
    listNamespaces(['default', 'kube-system', 'team-a']);

    expect(offeredNamespaces('cluster-a')).toEqual(['default', 'team-a']);
  });

  it('offers the listed namespaces of a cluster without allowed namespaces', () => {
    listNamespaces(['kube-system', 'default', 'shop']);

    expect(offeredNamespaces('cluster-b')).toEqual(['default', 'kube-system', 'shop']);
  });

  it('offers the allowed namespaces of every selected cluster that has them', () => {
    storeClusterSettings('cluster-a', { allowedNamespaces: ['team-a'] });
    storeClusterSettings('cluster-b', { allowedNamespaces: ['team-b'] });
    listNamespaces(['default', 'team-a', 'team-b']);

    expect(offeredNamespaces('cluster-a+cluster-b')).toEqual(['team-a', 'team-b']);
  });

  it('lists the namespaces of a selected cluster without allowed namespaces, whatever the order', () => {
    storeClusterSettings('cluster-a', { allowedNamespaces: ['team-a'] });
    listNamespaces(['default', 'shop']);

    // cluster-a only allows team-a, but cluster-b has no limit, so its namespaces stay
    // filterable, and team-a is kept even if cluster-a's namespaces can't be listed.
    expect(offeredNamespaces('cluster-a+cluster-b')).toEqual(['default', 'shop', 'team-a']);
  });

  it('gives the same namespaces with the clusters selected in the other order', () => {
    storeClusterSettings('cluster-a', { allowedNamespaces: ['team-a'] });
    listNamespaces(['default', 'shop']);

    expect(offeredNamespaces('cluster-b+cluster-a')).toEqual(['default', 'shop', 'team-a']);
  });
});
