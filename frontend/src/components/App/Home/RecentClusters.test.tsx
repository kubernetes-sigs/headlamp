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
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Cluster } from '../../../lib/k8s/cluster';
import RecentClusters from './RecentClusters';

function makeCluster(name: string, displayName: string): Cluster {
  return {
    name,
    auth_type: '',
    meta_data: {
      source: 'cluster_inventory',
      clusterInventory: {
        profile: { namespace: 'default', name, key: name, displayName },
      },
    },
  } as Cluster;
}

function LocationDisplay() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

it('keeps and deselects a cluster by name after its display metadata changes', () => {
  localStorage.clear();

  const first = makeCluster('cluster-a', 'Alpha');
  const second = makeCluster('cluster-b', 'Beta');
  const renderRecent = (clusters: Cluster[]) => (
    <MemoryRouter>
      <RecentClusters clusters={clusters} onButtonClick={vi.fn()} />
    </MemoryRouter>
  );

  const { rerender } = render(renderRecent([first, second]));
  fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
  expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'true');

  rerender(renderRecent([makeCluster('cluster-a', 'Zulu'), second]));
  const renamedButton = screen.getByRole('button', { name: 'Zulu' });
  expect(renamedButton).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(renamedButton);
  expect(renamedButton).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'View' })).toBeDisabled();
});

it('keeps the first selected cluster as the current cluster after a rename', () => {
  localStorage.clear();

  const first = makeCluster('cluster-a', 'Alpha');
  const second = makeCluster('cluster-b', 'Beta');
  const renderRecent = (clusters: Cluster[]) => (
    <MemoryRouter>
      <RecentClusters clusters={clusters} onButtonClick={vi.fn()} />
      <LocationDisplay />
    </MemoryRouter>
  );

  const { rerender } = render(renderRecent([first, second]));
  fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
  fireEvent.click(screen.getByRole('button', { name: 'Beta' }));

  rerender(renderRecent([makeCluster('cluster-a', 'Zulu'), second]));
  fireEvent.click(screen.getByRole('button', { name: 'View' }));

  expect(screen.getByTestId('location')).toHaveTextContent('/c/cluster-a+cluster-b');
});

it('keeps a selected cluster visible when a rename moves it out of the three-option fallback', () => {
  localStorage.clear();

  const first = makeCluster('cluster-a', 'Alpha');
  const second = makeCluster('cluster-b', 'Beta');
  const third = makeCluster('cluster-c', 'Gamma');
  const fourth = makeCluster('cluster-d', 'Delta');
  const renderRecent = (clusters: Cluster[]) => (
    <MemoryRouter>
      <RecentClusters clusters={clusters} onButtonClick={vi.fn()} />
    </MemoryRouter>
  );

  const { rerender } = render(renderRecent([first, second, third, fourth]));
  fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));

  rerender(renderRecent([second, fourth, third, makeCluster('cluster-a', 'Zulu')]));
  const renamedButton = screen.getByRole('button', { name: 'Zulu' });
  expect(renamedButton).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'View' })).toBeEnabled();

  fireEvent.click(renamedButton);
  expect(screen.getByRole('button', { name: 'View' })).toBeDisabled();
});
