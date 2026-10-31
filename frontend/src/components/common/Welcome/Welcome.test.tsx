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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import App from '../../../App';
import { isElectron } from '../../../helpers/isElectron';
import { Cluster } from '../../../lib/k8s/cluster';
import { setAppSettings, setConfig } from '../../../redux/configSlice';
import store from '../../../redux/stores/store';
import Welcome, { WELCOME_DISMISSED_STORAGE_KEY } from './Welcome';

vi.mock('../../../helpers/isElectron', () => ({ isElectron: vi.fn(() => false) }));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function renderWelcome() {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <Welcome />
      </BrowserRouter>
    </Provider>
  );
}

describe('Welcome', () => {
  beforeEach(() => {
    vi.mocked(isElectron).mockReturnValue(false);
    localStorage.clear();
    store.dispatch(setAppSettings({ tutorialTooltips: true }));
    store.dispatch(setConfig({ clusters: null }));
    window.history.pushState({}, '', '/c/my-cluster/cluster');
  });

  it('disables guided tooltips from the welcome dialog', () => {
    renderWelcome();

    const checkbox = screen.getByRole('checkbox', { name: 'Disable guided tooltips' });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(store.getState().config.settings.tutorialTooltips).toBe(false);
    expect(JSON.parse(localStorage.getItem('settings') || '{}').tutorialTooltips).toBe(false);

    fireEvent.click(checkbox);
    expect(store.getState().config.settings.tutorialTooltips).toBe(true);
  });

  it('explains the guided tooltips checkbox on hover', async () => {
    renderWelcome();

    fireEvent.mouseOver(screen.getByRole('checkbox', { name: 'Disable guided tooltips' }));

    expect(
      await screen.findByText('Disable helpful tooltips for navigating Headlamp')
    ).toBeInTheDocument();
  });

  it('introduces Headlamp and the current cluster on first use', () => {
    renderWelcome();

    expect(screen.getByText('Welcome to Headlamp')).toBeVisible();
    // Section titles follow the dialog's h1 without skipping heading levels.
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Headlamp' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Quick start' })).toBeVisible();
    expect(screen.queryByRole('heading', { level: 6 })).not.toBeInTheDocument();
    expect(screen.getByText('my-cluster')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Read the docs' })).toHaveAttribute(
      'href',
      'https://headlamp.dev/docs/latest/'
    );
    expect(screen.getByRole('link', { name: 'Explore Learn' })).toHaveAttribute(
      'href',
      'https://headlamp.dev/docs/latest/learn'
    );
    expect(screen.getByRole('button', { name: 'View your clusters' })).toBeVisible();
  });

  it('persists dismissal when "Don\'t show again" is checked before close', () => {
    const { unmount } = renderWelcome();

    fireEvent.click(screen.getByRole('checkbox', { name: "Don't show again" }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');

    unmount();
    renderWelcome();

    expect(screen.queryByText('Welcome to Headlamp')).not.toBeInTheDocument();
  });

  it('does not persist dismissal when closed without checking "Don\'t show again"', () => {
    const { unmount } = renderWelcome();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBeNull();

    unmount();
    renderWelcome();

    expect(screen.getByText('Welcome to Headlamp')).toBeVisible();
  });

  it('does not show for users who already use Headlamp', () => {
    // A signal of prior usage: the user has connected to clusters before.
    localStorage.setItem('recent_clusters', JSON.stringify(['prod']));

    renderWelcome();

    expect(screen.queryByText('Welcome to Headlamp')).not.toBeInTheDocument();
    // The flag is backfilled so we skip the usage scan on later renders.
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
  });

  it('routes to the Add Cluster page from the quick-start action in the desktop app', async () => {
    vi.mocked(isElectron).mockReturnValue(true);
    window.history.pushState({}, '', '/advanced-search');

    renderWelcome();

    fireEvent.click(screen.getByRole('button', { name: 'Add a cluster' }));

    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
    expect(window.location.pathname).toBe('/add-cluster');
    await waitFor(() => expect(screen.queryByText('Welcome to Headlamp')).not.toBeInTheDocument());
  });

  it('routes to the cluster list on web when several clusters are configured', () => {
    store.dispatch(
      setConfig({
        clusters: {
          prod: { name: 'prod' } as Cluster,
          staging: { name: 'staging' } as Cluster,
        },
      })
    );
    window.history.pushState({}, '', '/advanced-search');

    renderWelcome();

    expect(screen.getByText(/Pick a cluster to get started\./)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add a cluster' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View your clusters' }));

    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
    expect(window.location.pathname).toBe('/');
  });

  it('opens the only configured cluster on web', () => {
    store.dispatch(setConfig({ clusters: { prod: { name: 'prod' } as Cluster } }));
    window.history.pushState({}, '', '/advanced-search');

    renderWelcome();

    fireEvent.click(screen.getByRole('button', { name: 'Open your cluster' }));

    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBe('true');
    expect(window.location.pathname).toMatch(/^\/c\/prod\/?$/);
  });

  it('points to the installation guide on web when no clusters are configured', () => {
    store.dispatch(setConfig({ clusters: {} }));

    renderWelcome();

    expect(screen.getByText(/Connect a cluster to get started\./)).toBeVisible();
    const guide = screen.getByRole('link', { name: 'Learn how to add a cluster' });
    expect(guide).toHaveAttribute('href', 'https://headlamp.dev/docs/latest/installation/');
    expect(guide).toHaveAttribute('target', '_blank');

    fireEvent.click(guide);

    // An external guide shouldn't dismiss the welcome.
    expect(localStorage.getItem(WELCOME_DISMISSED_STORAGE_KEY)).toBeNull();
    expect(screen.getByText('Welcome to Headlamp')).toBeVisible();
  });
});
