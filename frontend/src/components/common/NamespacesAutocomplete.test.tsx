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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { setDiscoveredNamespaces } from '../../helpers/clusterSettings';
import { TestContext } from '../../test';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

const selection = vi.hoisted(() => ({ clusters: [] as string[] }));

vi.mock('../../lib/k8s', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s')>()),
  useCluster: () => 'prod',
  useSelectedClusters: () => selection.clusters,
  useClustersConf: () => ({}),
}));

// Without a restriction the component lists namespaces from the cluster API.
vi.mock('../../lib/k8s/namespace', () => ({
  default: {
    useList: () => [[{ metadata: { name: 'from-cluster-api' } }], null],
  },
}));

function optionNames(): string[] {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  const names = screen.queryAllByRole('option').map(option => option.textContent ?? '');
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
  return names;
}

describe('NamespacesAutocomplete with namespace discovery', () => {
  beforeEach(() => {
    localStorage.clear();
    setDiscoveredNamespaces('prod', null);
  });

  afterEach(() => {
    setDiscoveredNamespaces('prod', null);
    setDiscoveredNamespaces('dev', null);
    selection.clusters = [];
  });

  it('follows discovered namespaces when they change, empty or get dropped', () => {
    setDiscoveredNamespaces('prod', ['team-a']);
    render(
      <TestContext>
        <NamespacesAutocomplete />
      </TestContext>
    );
    expect(optionNames()).toEqual(['team-a']);

    // A background refresh finds a new namespace.
    act(() => setDiscoveredNamespaces('prod', ['team-a', 'team-b']));
    expect(optionNames()).toEqual(['team-a', 'team-b']);

    // The restriction is dropped (e.g. discovery failed): back to the cluster list.
    act(() => setDiscoveredNamespaces('prod', null));
    expect(optionNames()).toEqual(['from-cluster-api']);

    // An empty restriction does not keep stale names either.
    act(() => setDiscoveredNamespaces('prod', ['team-c']));
    expect(optionNames()).toEqual(['team-c']);
    act(() => setDiscoveredNamespaces('prod', []));
    expect(optionNames()).not.toContain('team-c');
  });

  it('keeps the existing behaviour for namespaces configured in the settings', async () => {
    localStorage.setItem(
      'cluster_settings.prod',
      JSON.stringify({ allowedNamespaces: ['manual-a', 'manual-b'] })
    );
    render(
      <TestContext>
        <NamespacesAutocomplete />
      </TestContext>
    );

    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    await waitFor(() => expect(optionNames()).toEqual(['manual-a', 'manual-b']));
  });

  it('combines discovered namespaces when every selected cluster uses discovery', () => {
    selection.clusters = ['prod', 'dev'];
    setDiscoveredNamespaces('prod', ['team-b', 'team-a']);
    setDiscoveredNamespaces('dev', ['team-c', 'team-a']);
    render(
      <TestContext>
        <NamespacesAutocomplete />
      </TestContext>
    );

    expect(optionNames()).toEqual(['team-a', 'team-b', 'team-c']);
  });

  it('keeps the multi-cluster list when another selected cluster does not use discovery', () => {
    selection.clusters = ['prod', 'dev'];
    setDiscoveredNamespaces('prod', ['team-a']);
    render(
      <TestContext>
        <NamespacesAutocomplete />
      </TestContext>
    );

    // dev is not restricted by discovery, so its namespaces must not disappear.
    expect(optionNames()).toEqual(['from-cluster-api']);
  });
});
