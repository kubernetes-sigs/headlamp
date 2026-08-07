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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { reloadPage } from '../../../helpers/window';
import { createMuiTheme } from '../../../lib/themes';
import { HeadlampEventType } from '../../../redux/headlampEventSlice';
import store from '../../../redux/stores/store';
import { recordHeadlampEvents, TestContext } from '../../../test';
import { setTheme } from '../themeSlice';
import Settings from './Settings';
import SettingsCluster from './SettingsCluster';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ name: 'Light', base: 'light' });

function renderWithProviders(children: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TestContext>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </TestContext>
    </QueryClientProvider>
  );
}

describe('Settings events', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('dispatches SETTINGS_VIEW with the active theme', async () => {
    store.dispatch(setTheme('light'));
    const events = recordHeadlampEvents();

    renderWithProviders(<Settings />);

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.SETTINGS_VIEW)).toEqual([
        { type: HeadlampEventType.SETTINGS_VIEW, data: { theme: 'light' } },
      ]);
    });
  });

  it('dispatches CLUSTER_SETTINGS_VIEW with the cluster from the URL', async () => {
    // SettingsCluster resolves the cluster from window.location, not from the router.
    window.history.pushState({}, '', '/c/cluster-1/settings');
    const events = recordHeadlampEvents();

    renderWithProviders(<SettingsCluster />);

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.CLUSTER_SETTINGS_VIEW)).toEqual([
        { type: HeadlampEventType.CLUSTER_SETTINGS_VIEW, data: { cluster: 'cluster-1' } },
      ]);
    });
  });
});

vi.mock('../../../helpers/window', () => ({
  reloadPage: vi.fn(),
}));

describe('Settings - Reset App State', () => {
  beforeEach(() => {
    vi.mocked(reloadPage).mockClear();
    vi.restoreAllMocks();
  });

  it('cancels the reset dialog without clearing local storage', async () => {
    const clearSpy = vi.spyOn(localStorage, 'clear');
    renderWithProviders(<Settings />);

    await userEvent.click(screen.getByRole('button', { name: /Reset App State/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /No/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(clearSpy).not.toHaveBeenCalled();
    expect(reloadPage).not.toHaveBeenCalled();
  });

  it('confirms the reset dialog, clears local storage, and reloads the page', async () => {
    const clearSpy = vi.spyOn(localStorage, 'clear');
    localStorage.setItem('headlamp-userId', 'test-user-id');
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    renderWithProviders(<Settings />);

    await userEvent.click(screen.getByRole('button', { name: /Reset App State/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Yes/i }));

    expect(clearSpy).toHaveBeenCalled();
    expect(setItemSpy).toHaveBeenCalledWith('headlamp-userId', 'test-user-id');
    expect(reloadPage).toHaveBeenCalled();
  });

  it('handles local storage error gracefully and still reloads', async () => {
    const clearSpy = vi.spyOn(localStorage, 'clear').mockImplementation(() => {
      throw new Error('mock error');
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderWithProviders(<Settings />);

    await userEvent.click(screen.getByRole('button', { name: /Reset App State/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Yes/i }));

    expect(clearSpy).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to clear local storage during app reset',
      expect.any(Error)
    );
    expect(reloadPage).toHaveBeenCalled();
  });
});
