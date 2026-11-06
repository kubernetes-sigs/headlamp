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
import { render, screen, within } from '@testing-library/react';
import { isElectron } from '../../../helpers/isElectron';
import { createMuiTheme } from '../../../lib/themes';
import { setAppSettings } from '../../../redux/configSlice';
import store from '../../../redux/stores/store';
import { TestContext } from '../../../test';
import { setSidebarItem } from '../../Sidebar/sidebarSlice';
import AddCluster from './AddCluster';

vi.mock('../../../helpers/isElectron', () => ({ isElectron: vi.fn(() => false) }));

const theme = createMuiTheme({ name: 'Light', base: 'light' });

function renderAddCluster() {
  return render(
    <TestContext store={store}>
      <ThemeProvider theme={theme}>
        <AddCluster open onChoice={() => {}} />
      </ThemeProvider>
    </TestContext>
  );
}

describe('AddCluster tutorial info boxes', () => {
  beforeEach(() => {
    vi.mocked(isElectron).mockReturnValue(false);
    store.dispatch(setAppSettings({ tutorialTooltips: true }));
  });

  it('explains the KubeConfig option with a recommendation', () => {
    renderAddCluster();

    const box = screen.getByRole('note', { name: 'About loading from KubeConfig' });
    expect(
      within(box).getByText(
        'Load an existing kubeconfig file to add the clusters it defines to Headlamp.'
      )
    ).toBeVisible();
    expect(
      within(box).getByText(
        'If you are using a managed cloud cluster (such as AKS, EKS or GKE) or already have a kubeconfig file, use this option.'
      )
    ).toBeVisible();
  });

  it('explains the local cluster provider option with a recommendation', () => {
    vi.mocked(isElectron).mockReturnValue(true);
    store.dispatch(
      setSidebarItem({ name: 'plugin-catalog', label: 'Plugin Catalog', url: '/plugin-catalog' })
    );

    renderAddCluster();

    expect(screen.getByRole('button', { name: 'Add Local Cluster Provider' })).toBeVisible();
    const box = screen.getByRole('note', { name: 'About local cluster providers' });
    expect(
      within(box).getByText(
        'Install a plugin, such as Minikube, that creates and manages a local Kubernetes cluster on your machine.'
      )
    ).toBeVisible();
    expect(
      within(box).getByText(
        "If you are using Headlamp to learn or test Kubernetes and don't have a cluster yet, use this option."
      )
    ).toBeVisible();
  });

  it('hides tutorial info boxes when the setting is disabled', () => {
    store.dispatch(setAppSettings({ tutorialTooltips: false }));

    renderAddCluster();

    expect(screen.getByRole('button', { name: 'Load from KubeConfig' })).toBeVisible();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });
});
