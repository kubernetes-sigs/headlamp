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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import uiReducer, { uiSlice } from '../../redux/uiSlice';
import { TestContext } from '../../test';
import VersionDialog from './VersionDialog';

const { getProductName, getProductVersion, translate } = vi.hoisted(() => ({
  getProductName: vi.fn<() => string | undefined>(() => 'Headlamp'),
  getProductVersion: vi.fn<() => string | undefined>(),
  translate: vi.fn((key: string, options?: { productName?: string }) =>
    key
      .split('|')
      .at(-1)!
      .replace('{{ productName }}', options?.productName || '')
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: translate }),
}));

vi.mock('../../helpers/getProductInfo', () => ({
  getProductName,
  getProductVersion,
  getVersion: () => ({ VERSION: 'unused', GIT_VERSION: 'unused' }),
}));

const desktopApiBase = { platform: 'darwin' as NodeJS.Platform };

function renderVersionDialog(
  options: {
    useDefaultVersion?: boolean;
    productVersion?: string;
  } = {}
) {
  const { useDefaultVersion = false, productVersion } = options;
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
          getProductVersion={productVersion === undefined ? undefined : () => productVersion}
        />
      </ThemeProvider>
    </TestContext>
  );

  return store;
}

describe('VersionDialog', () => {
  beforeEach(() => {
    getProductName.mockReturnValue('Headlamp');
    getProductVersion.mockReturnValue(undefined);
    translate.mockClear();
  });

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
    renderVersionDialog({ useDefaultVersion: true });

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

  it('does not repeat a product version that matches the Headlamp version', () => {
    renderVersionDialog({ productVersion: '1.2.3' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Version');
    expect(dialog).not.toHaveTextContent('Headlamp Version');
  });

  it('does not show a whitespace-only product version', () => {
    renderVersionDialog({ productVersion: ' \t\n' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Version');
    expect(dialog).not.toHaveTextContent('Product Version');
    expect(dialog).not.toHaveTextContent('Headlamp Version');
  });

  it('does not repeat a padded product version that matches the Headlamp version', () => {
    renderVersionDialog({ productVersion: ' 1.2.3\t' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Version');
    expect(dialog).not.toHaveTextContent('Product Version');
    expect(dialog).not.toHaveTextContent('Headlamp Version');
  });

  it('shows distinct product and Headlamp versions', () => {
    getProductName.mockReturnValue('AKS Desktop');

    renderVersionDialog({ productVersion: '2.0.0' });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('AKS Desktop Version');
    expect(dialog).toHaveTextContent('2.0.0');
    expect(dialog).toHaveTextContent('Headlamp Version');
    expect(dialog).toHaveTextContent('1.2.3');
    expect(translate).toHaveBeenCalledWith('translation|{{ productName }} Version', {
      productName: 'AKS Desktop',
    });
  });

  it('distinguishes the product version when using the default product name', () => {
    renderVersionDialog({ productVersion: '2.0.0' });

    expect(screen.getByText('Product Version')).toBeVisible();
    expect(screen.getByText('Headlamp Version')).toBeVisible();
    expect(translate).toHaveBeenCalledWith('translation|{{ productName }} Version', {
      productName: 'Product',
    });
  });

  it('uses a generic label when the product name is unavailable', () => {
    getProductName.mockReturnValue(undefined);

    renderVersionDialog({ productVersion: '2.0.0' });

    expect(screen.getByText('Product Version')).toBeVisible();
    expect(translate).toHaveBeenCalledWith('translation|{{ productName }} Version', {
      productName: 'Product',
    });
    expect(translate).toHaveBeenCalledWith('translation|Product');
  });
});
