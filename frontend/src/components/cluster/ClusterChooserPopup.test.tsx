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

import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { setRecentCluster } from '../../helpers/recentClusters';
import { TestContext } from '../../test';
import ClusterChooserPopup from './ClusterChooserPopup';

// ClusterChooserPopup transitively pulls in k8s resource classes which have a
// circular dependency that breaks module initialisation in the test
// environment. Mock the two hooks it needs from there.
vi.mock('../../lib/k8s', () => ({
  useClustersConf: () => ({ cluster0: { name: 'cluster0' }, cluster1: { name: 'cluster1' } }),
  useSelectedClusters: () => ['cluster0'],
}));

it('names the cluster listbox after the filter field', () => {
  render(
    <TestContext routerMap={{ cluster: 'cluster0' }} urlPrefix="/c">
      <ClusterChooserPopup anchor={document.body} />
    </TestContext>
  );

  expect(screen.getByRole('listbox', { name: 'Choose cluster' })).toBeInTheDocument();
});

it('keeps the recent-cluster divider out of the listbox accessibility tree', () => {
  setRecentCluster('cluster1');

  render(
    <TestContext routerMap={{ cluster: 'cluster0' }} urlPrefix="/c">
      <ClusterChooserPopup anchor={document.body} />
    </TestContext>
  );

  const listbox = screen.getByRole('listbox', { name: 'Choose cluster' });
  expect(within(listbox).getAllByRole('option')).toHaveLength(2);
  expect(within(listbox).queryByRole('separator')).not.toBeInTheDocument();
});
