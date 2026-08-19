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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import * as configExportImport from '../../../lib/configExportImport';
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
    <TestContext>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </TestContext>
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

describe('Settings Import Configuration', () => {
  let alertMock: any;
  let reloadMock: any;
  let importConfigMock: any;

  beforeEach(() => {
    alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { reload: vi.fn() },
    });
    reloadMock = window.location.reload;
    importConfigMock = vi.spyOn(configExportImport, 'importConfig');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles cancel properly', async () => {
    renderWithProviders(<Settings />);

    // Open import dialog
    const importBtn = screen.getByLabelText('Import Configuration');
    fireEvent.click(importBtn);

    // Confirm dialog appears
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);

    // Dialog closes
    await waitFor(() => {
      expect(screen.queryByText('Import')).not.toBeInTheDocument();
    });
  });

  it('handles invalid input and failure', async () => {
    importConfigMock.mockReturnValue(false);
    renderWithProviders(<Settings />);

    // Open import dialog
    const importBtn = screen.getByLabelText('Import Configuration');
    fireEvent.click(importBtn);

    // Confirm dialog
    const confirmBtn = screen.getByText('Import');
    fireEvent.click(confirmBtn);

    // Trigger file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['invalid'], 'test.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
    });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(importConfigMock).toHaveBeenCalled();
      expect(alertMock).toHaveBeenCalledWith(
        'Failed to import configuration. The file might be corrupted or invalid.'
      );
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });

  it('handles successful import and reload', async () => {
    importConfigMock.mockReturnValue(true);
    renderWithProviders(<Settings />);

    // Open import dialog
    const importBtn = screen.getByLabelText('Import Configuration');
    fireEvent.click(importBtn);

    // Confirm dialog
    const confirmBtn = screen.getByText('Import');
    fireEvent.click(confirmBtn);

    // Trigger file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"key": "value"}'], 'test.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', {
      value: [file],
    });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(importConfigMock).toHaveBeenCalled();
      expect(reloadMock).toHaveBeenCalled();
    });
  });
});
