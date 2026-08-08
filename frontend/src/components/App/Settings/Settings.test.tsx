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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import { TestContext } from '../../../test';
import Settings from './Settings';

const theme = createMuiTheme({ name: 'light', base: 'light' });

describe('Settings - Reset App State', () => {
  let reloadSpy: any;
  const originalLocation = window.location;

  beforeAll(() => {
    // @ts-ignore
    delete window.location;
    reloadSpy = vi.fn();
    window.location = { ...originalLocation, reload: reloadSpy } as any;
  });

  afterAll(() => {
    window.location = originalLocation as any;
  });

  beforeEach(() => {
    reloadSpy.mockClear();
    vi.restoreAllMocks();
  });

  it('cancels the reset dialog without clearing local storage', async () => {
    const clearSpy = vi.spyOn(localStorage, 'clear');
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <Settings />
        </ThemeProvider>
      </TestContext>
    );

    await userEvent.click(screen.getByRole('button', { name: /Reset App State/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /No/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(clearSpy).not.toHaveBeenCalled();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('confirms the reset dialog, clears local storage, and reloads the page', async () => {
    const clearSpy = vi.spyOn(localStorage, 'clear');
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <Settings />
        </ThemeProvider>
      </TestContext>
    );

    await userEvent.click(screen.getByRole('button', { name: /Reset App State/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Yes/i }));

    expect(clearSpy).toHaveBeenCalled();
    expect(reloadSpy).toHaveBeenCalled();
  });

  it('handles local storage error gracefully and still reloads', async () => {
    const clearSpy = vi.spyOn(localStorage, 'clear').mockImplementation(() => {
      throw new Error('mock error');
    });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <Settings />
        </ThemeProvider>
      </TestContext>
    );

    await userEvent.click(screen.getByRole('button', { name: /Reset App State/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Yes/i }));

    expect(clearSpy).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to clear local storage during app reset',
      expect.any(Error)
    );
    expect(reloadSpy).toHaveBeenCalled();
  });
});
