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

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { ClusterSourceView, getClusterSource } from '../../../helpers/clusterPresentation';
import { Cluster } from '../../../lib/k8s/cluster';
import { createMuiTheme } from '../../../lib/themes';
import ClusterSourceTabs from './ClusterSourceTabs';

const sources: ClusterSourceView[] = [
  {
    id: 'inventory',
    label: 'Cluster Inventory API',
    nameLabel: 'ClusterProfile',
    configured: true,
  },
  { id: 'fleet', label: 'Fleet', nameLabel: 'Cluster', configured: true },
];
const clusters: Cluster[] = [
  { name: 'provider-a', auth_type: 'oidc', meta_data: { source: 'inventory' } },
  { name: 'provider-b', auth_type: 'oidc', meta_data: { source: 'inventory' } },
  { name: 'plugin', auth_type: '', meta_data: { source: 'custom', sourceLabel: 'Custom' } },
];
const theme = createMuiTheme({ name: 'light', base: 'light' });
function view(views = sources, rows = clusters, loading = false) {
  return (
    <ThemeProvider theme={theme}>
      <ClusterSourceTabs sources={views} clusters={rows} loading={loading}>
        {source => (
          <div data-testid="rows">
            {rows
              .filter(cluster => !source || getClusterSource(cluster) === source.id)
              .map(cluster => cluster.name)
              .join(',')}
          </div>
        )}
      </ClusterSourceTabs>
    </ThemeProvider>
  );
}

beforeEach(() => localStorage.clear());
it('counts connections, filters source rows and exposes configured empty sources', () => {
  render(view());
  expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Cluster Inventory API (2)' }));
  expect(screen.getByTestId('rows')).toHaveTextContent('provider-a,provider-b');
  fireEvent.click(screen.getByRole('tab', { name: 'Fleet (0)' }));
  expect(screen.getByTestId('rows')).toBeEmptyDOMElement();
  expect(screen.getByRole('tab', { name: 'Custom (1)' })).toBeInTheDocument();
});

it('links each tab to a labelled panel and only mounts the selected contents', () => {
  render(view());
  const tabs = screen.getAllByRole('tab');
  for (const tab of tabs) {
    const panel = document.getElementById(tab.getAttribute('aria-controls')!);
    expect(panel).toHaveAttribute('role', 'tabpanel');
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    expect(panel!.hidden).toBe(tab.getAttribute('aria-selected') !== 'true');
  }
  expect(screen.getAllByTestId('rows')).toHaveLength(1);
  fireEvent.click(screen.getByRole('tab', { name: 'Fleet (0)' }));
  expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Fleet (0)');
  expect(screen.getAllByTestId('rows')).toHaveLength(1);
});

it('uses different IDs for separate tab groups', () => {
  render(
    <>
      {view()}
      {view()}
    </>
  );
  const tabs = screen.getAllByRole('tab');
  expect(new Set(tabs.map(tab => tab.id)).size).toBe(tabs.length);
  for (const tab of tabs) {
    expect(document.getElementById(tab.getAttribute('aria-controls')!)).toHaveAttribute(
      'aria-labelledby',
      tab.id
    );
  }
});
it('restores a tab and falls back to All if its source disappears', () => {
  const rendered = render(view());
  fireEvent.click(screen.getByRole('tab', { name: 'Fleet (0)' }));
  rendered.unmount();
  const restored = render(view());
  expect(screen.getByRole('tab', { name: 'Fleet (0)' })).toHaveAttribute('aria-selected', 'true');
  restored.rerender(view(sources.slice(0, 1)));
  expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
  expect(JSON.parse(localStorage.getItem('home-cluster-source')!)).toBe('');
});
it('keeps the saved tab while the initial config is loading', () => {
  localStorage.setItem('home-cluster-source', JSON.stringify('fleet'));
  const rendered = render(view([], [], true));
  rendered.rerender(view());
  expect(screen.getByRole('tab', { name: 'Fleet (0)' })).toHaveAttribute('aria-selected', 'true');
});
it('keeps a saved advertised tab until its connections arrive', () => {
  const advertised = [...sources, { id: 'dynamic_cluster', label: 'Plugin', nameLabel: 'Name' }];
  localStorage.setItem('home-cluster-source', JSON.stringify('dynamic_cluster'));
  const rendered = render(view(advertised));
  expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
  expect(JSON.parse(localStorage.getItem('home-cluster-source')!)).toBe('dynamic_cluster');
  rendered.rerender(
    view(advertised, [
      ...clusters,
      { name: 'stateless', auth_type: '', meta_data: { source: 'dynamic_cluster' } },
    ])
  );
  expect(screen.getByRole('tab', { name: 'Plugin (1)' })).toHaveAttribute('aria-selected', 'true');
});
