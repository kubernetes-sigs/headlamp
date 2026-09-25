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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { ClusterScopeSelector } from './ClusterScopeSelector';

const mocks = vi.hoisted(() => ({
  historyPush: vi.fn(),
  selectedClusters: ['cluster-a'],
  createRouteURL: vi.fn(
    (_name: string, params: { cluster: string }) => `/c/${params.cluster}/advanced-search`
  ),
}));

vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => ({
    __all_clusters__: { name: '__all_clusters__' },
    'cluster-a': { name: 'cluster-a' },
    'cluster-b': { name: 'cluster-b' },
    'cluster-c': { name: 'cluster-c' },
  }),
  useSelectedClusters: () => mocks.selectedClusters,
}));

vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: mocks.createRouteURL,
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useHistory: () => ({
    push: mocks.historyPush,
    location: { search: '?namespace=default' },
  }),
}));

describe('ClusterScopeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedClusters = ['cluster-a'];
  });

  function renderSelector() {
    render(
      <TestContext>
        <ClusterScopeSelector />
      </TestContext>
    );
  }

  it('updates the Advanced Search route with the selected clusters', () => {
    renderSelector();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Clusters' }));
    fireEvent.click(screen.getByRole('option', { name: 'cluster-b' }));

    expect(mocks.createRouteURL).toHaveBeenCalledWith('advancedSearch', {
      cluster: 'cluster-a+cluster-b',
    });
    expect(mocks.historyPush).toHaveBeenCalledWith({
      pathname: '/c/cluster-a+cluster-b/advanced-search',
      search: '?namespace=default',
    });
  });

  it('does not show a delete action for the mandatory cluster scope', () => {
    renderSelector();

    expect(screen.queryByTestId('CancelIcon')).not.toBeInTheDocument();
  });

  it('provides an explicit option to search all configured clusters', () => {
    renderSelector();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Clusters' }));
    fireEvent.click(screen.getByRole('option', { name: 'Select all clusters' }));

    expect(mocks.createRouteURL).toHaveBeenCalledWith('advancedSearch', {
      cluster: 'cluster-a+__all_clusters__+cluster-b+cluster-c',
    });
  });

  it('keeps the current cluster first when selecting all clusters', () => {
    mocks.selectedClusters = ['cluster-c'];
    renderSelector();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Clusters' }));
    fireEvent.click(screen.getByRole('option', { name: 'Select all clusters' }));

    expect(mocks.createRouteURL).toHaveBeenCalledWith('advancedSearch', {
      cluster: 'cluster-c+__all_clusters__+cluster-a+cluster-b',
    });
  });

  it('selects a cluster whose name resembles the select-all action sentinel', () => {
    renderSelector();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Clusters' }));
    fireEvent.click(screen.getByRole('option', { name: '__all_clusters__' }));

    expect(mocks.createRouteURL).toHaveBeenCalledWith('advancedSearch', {
      cluster: 'cluster-a+__all_clusters__',
    });
  });

  it('does not hide an unknown selected cluster behind the all-clusters summary', () => {
    mocks.selectedClusters = [
      'cluster-a',
      '__all_clusters__',
      'cluster-b',
      'cluster-c',
      'unknown-cluster',
    ];
    renderSelector();

    expect(screen.queryByText('All clusters')).not.toBeInTheDocument();
    expect(screen.getByText('cluster-a')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Clusters' }));
    expect(screen.getByRole('option', { name: 'unknown-cluster' })).toBeInTheDocument();
  });

  it('makes hidden selected cluster names available to keyboard users', async () => {
    mocks.selectedClusters = ['cluster-a', 'cluster-b', 'cluster-c'];
    renderSelector();

    const hiddenClusters = screen.getByLabelText('cluster-b, cluster-c');
    act(() => hiddenClusters.focus());

    expect(hiddenClusters).toHaveFocus();
    expect(hiddenClusters).toHaveTextContent('+2');
    expect(await screen.findByRole('tooltip')).toHaveTextContent('cluster-bcluster-c');
  });
});
