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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { getRecentClusters } from '../../helpers/recentClusters';
import { selectClusterPresentation } from '../../helpers/useClusterPresentation';
import { useClustersConf } from '../../lib/k8s';
import { Cluster } from '../../lib/k8s/cluster';
import { createMuiTheme } from '../../lib/themes';
import { setConfig } from '../../redux/configSlice';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import ClusterSelector from '../App/Settings/ClusterSelector';
import ClusterChooser from './ClusterChooser';
import ClusterChooserPopup from './ClusterChooserPopup';

const sources = [
  {
    id: 'inventory',
    label: 'Cluster Inventory API',
    nameLabel: 'ClusterProfile',
    summaryFields: ['namespace', 'provider'],
  },
];
const connection = (provider: string): Cluster => ({
  name: `opaque-${provider}`,
  auth_type: 'oidc',
  meta_data: {
    source: 'inventory',
    presentation: { displayName: 'production', fields: { namespace: 'team-a', provider } },
  },
});
const clusters = [connection('oidc'), connection('vpn')];
const theme = createMuiTheme({ name: 'light', base: 'light' });
function Location() {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.search}
    </output>
  );
}
function wrapper({ children }: React.PropsWithChildren<{}>) {
  return (
    <TestContext>
      <ThemeProvider theme={theme}>
        {children}
        <Location />
      </ThemeProvider>
    </TestContext>
  );
}
beforeEach(() => {
  localStorage.clear();
  store.dispatch(
    setConfig({
      clusters: Object.fromEntries(clusters.map(cluster => [cluster.name, cluster])),
      clusterSources: sources,
    })
  );
});

it('shows the resource name and provider in the top chooser', () => {
  render(<ClusterChooser cluster={clusters[0].name} clickHandler={() => {}} />, { wrapper });
  expect(screen.getByText('production')).toBeInTheDocument();
  expect(screen.getByText('Cluster Inventory API · team-a · oidc')).toBeInTheDocument();
});

it('shares the index between consumers and retains it when unrelated settings change', () => {
  const state = store.getState();
  const first = selectClusterPresentation(state, 'en');
  expect(selectClusterPresentation(state, 'en')).toBe(first);
  const updated = {
    ...state,
    config: { ...state.config, settings: { ...state.config.settings, timezone: 'Asia/Tokyo' } },
  };
  expect(selectClusterPresentation(updated, 'en')).toBe(first);
  expect(first.getLabel(clusters[0].name)).toBe(first.getLabel(clusters[0]));
});

it('updates translated summaries when the provider language changes', async () => {
  const instance = createInstance();
  await instance.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: { Plugin: 'Plugin' } },
      zh: { translation: { Plugin: '插件' } },
    },
  });
  store.dispatch(
    setConfig({
      clusters: Object.fromEntries(clusters.map(cluster => [cluster.name, cluster])),
      clusterSources: [{ ...sources[0], label: 'Plugin' }],
    })
  );
  render(
    <I18nextProvider i18n={instance}>
      <ClusterChooser cluster={clusters[0].name} clickHandler={() => {}} />
    </I18nextProvider>,
    { wrapper }
  );
  expect(screen.getByText('Plugin · team-a · oidc')).toBeInTheDocument();
  await act(() => instance.changeLanguage('zh'));
  expect(screen.getByText('插件 · team-a · oidc')).toBeInTheDocument();
  expect(store.getState().config.clusters?.['opaque-oidc']?.name).toBe('opaque-oidc');
  expect(store.getState().config.clusterSources?.[0].label).toBe('Plugin');
});

it('searches a provider and opens that connection from the popup', async () => {
  render(<ClusterChooserPopup anchor={document.body} />, { wrapper });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'vpn' } });
  const option = screen.getByRole('option');
  expect(option).toHaveTextContent('production');
  expect(option).toHaveTextContent('vpn');
  fireEvent.click(option);
  await waitFor(() => expect(screen.getByText('/c/opaque-vpn')).toBeInTheDocument());
  expect(screen.getByText('/c/opaque-vpn')).toBeInTheDocument();
  expect(getRecentClusters()).toContain('opaque-vpn');
});

it('keeps raw connection IDs in the settings URL', () => {
  render(
    <ClusterSelector
      currentCluster={clusters[0].name}
      clusters={clusters.map(cluster => cluster.name)}
    />,
    { wrapper }
  );
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: /vpn/ }));
  expect(screen.getByText('/settings/cluster?c=opaque-vpn')).toBeInTheDocument();
});

it('refreshes presentation metadata without changing cluster keys', () => {
  function Probe() {
    const config = useClustersConf();
    return <span>{config?.['opaque-oidc']?.meta_data?.presentation?.displayName}</span>;
  }
  render(<Probe />, { wrapper });
  expect(screen.getByText('production')).toBeInTheDocument();
  const updated = {
    ...clusters[0],
    meta_data: {
      ...clusters[0].meta_data,
      presentation: { displayName: 'renamed production', fields: { provider: 'oidc' } },
    },
  };
  act(() =>
    store.dispatch(
      setConfig({ clusters: { [updated.name]: updated, [clusters[1].name]: clusters[1] } })
    )
  );
  expect(screen.getByText('renamed production')).toBeInTheDocument();
  expect(store.getState().config.clusters?.['opaque-oidc']?.name).toBe('opaque-oidc');
});
