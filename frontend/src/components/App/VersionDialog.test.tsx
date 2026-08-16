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
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import uiReducer, { uiSlice } from '../../redux/uiSlice';
import { TestContext } from '../../test';
import VersionDialog from './VersionDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop() ?? key,
  }),
}));

vi.mock('../../helpers/getProductInfo', () => ({
  getProductName: () => 'Headlamp',
  getVersion: () => ({ VERSION: 'unused', GIT_VERSION: 'unused' }),
}));

const desktopApiBase = { platform: 'darwin' as NodeJS.Platform };

function renderVersionDialog(useDefaultVersion = false) {
  const store = configureStore({ reducer: { ui: uiReducer } });
  const theme = createMuiTheme({ name: 'Light', base: 'light' });
  store.dispatch(uiSlice.actions.setVersionDialogOpen(true));

  render(
    <TestContext store={store}>
      <ThemeProvider theme={theme}>
        <VersionDialog
          getVersion={
            useDefaultVersion ? undefined : () => ({ VERSION: '1.2.3', GIT_VERSION: 'abc123' })
          }
        />
      </ThemeProvider>
    </TestContext>
  );

  return store;
}

describe('VersionDialog', () => {
  afterEach(() => {
    window.desktopApi = { ...desktopApiBase };
  });

  it('shows version information without tabs in a browser host', () => {
    renderVersionDialog();

    const dialog = screen.getByRole('dialog', { name: 'Headlamp' });
    expect(dialog).toHaveTextContent('Version');
    expect(dialog).toHaveTextContent('1.2.3');
    expect(dialog).toHaveTextContent('Git Commit');
    expect(dialog).toHaveTextContent('abc123');
    expect(screen.queryByRole('tab', { name: 'Legal' })).not.toBeInTheDocument();
  });

  it('uses the product version provider by default', () => {
    renderVersionDialog(true);

    expect(screen.getByRole('dialog', { name: 'Headlamp' })).toHaveTextContent('unused');
  });

  it('shows legal documents in a host that declares the capability', async () => {
    window.desktopApi = {
      ...desktopApiBase,
      getLegalDocuments: vi.fn().mockResolvedValue([{ id: 'license', title: 'License' }]),
      getLegalDocument: vi.fn().mockResolvedValue({ success: true, content: 'license text' }),
    };
    renderVersionDialog();

    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Legal' }));

    expect(await screen.findByRole('button', { name: 'License' })).toBeInTheDocument();
  });

  it('closes through the dialog action', () => {
    const store = renderVersionDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(store.getState().ui.isVersionDialogOpen).toBe(false);
  });
});
