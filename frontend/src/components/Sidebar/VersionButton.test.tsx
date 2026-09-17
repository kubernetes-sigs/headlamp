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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVersion } from '../../lib/k8s';
import { createMuiTheme } from '../../lib/themes';
import reducers from '../../redux/reducers/reducers';
import VersionButton from './VersionButton';

// Mock getVersion
vi.mock('../../lib/k8s', () => ({
  getVersion: vi.fn(),
  useCluster: () => 'test-cluster',
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, any>) => {
      let text = key.replace(/^translation\|/, '');
      if (options) {
        Object.entries(options).forEach(([k, v]) => {
          text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), String(v));
        });
      }
      return text;
    },
    i18n: {
      language: 'en',
    },
  }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});
const theme = createMuiTheme({ name: 'light', base: 'light' });

describe('VersionButton', () => {
  const store = configureStore({
    reducer: reducers,
  });

  function renderVersionButton() {
    return render(
      <Provider store={store}>
        <ThemeProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter>
              <SnackbarProvider>
                <VersionButton />
              </SnackbarProvider>
            </MemoryRouter>
          </QueryClientProvider>
        </ThemeProvider>
      </Provider>
    );
  }

  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
      consoleErrorSpy = null;
    }
  });

  it('renders nothing when there is no cluster version', async () => {
    vi.mocked(getVersion).mockResolvedValueOnce(null as any);
    const { container } = renderVersionButton();

    await waitFor(() => {
      expect(queryClient.getQueryState(['version', 'test-cluster'])?.status).toBe('success');
    });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders version button and handles click', async () => {
    vi.mocked(getVersion).mockResolvedValueOnce({
      gitVersion: 'v1.28.0',
      gitCommit: 'abc1234',
      gitTreeState: 'clean',
      goVersion: 'go1.20',
      platform: 'linux/amd64',
    });

    renderVersionButton();

    // Wait for the button to appear
    const button = await screen.findByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('v1.28.0');

    // Click the button to open the dialog
    await userEvent.click(button);

    // Verify dialog content
    expect(await screen.findByText('Git Version')).toBeInTheDocument();
    expect(screen.getAllByText('v1.28.0').length).toBeGreaterThan(0);
    expect(screen.getByText('Git Commit')).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(screen.getByText('Git Tree State')).toBeInTheDocument();
    expect(screen.getByText('clean')).toBeInTheDocument();
    expect(screen.getByText('Go Version')).toBeInTheDocument();
    expect(screen.getByText('go1.20')).toBeInTheDocument();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByText('linux/amd64')).toBeInTheDocument();

    // Close the dialog
    const closeButton = screen.getAllByRole('button', { name: /close/i })[0];
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Git Version')).not.toBeInTheDocument();
    });
  });

  it('handles getVersion error gracefully', async () => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getVersion).mockRejectedValueOnce(new Error('Network error'));

    const { container } = renderVersionButton();

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Getting the cluster version:',
        expect.any(Error)
      );
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows snackbar when cluster version is upgraded', async () => {
    // Initial fetch
    vi.mocked(getVersion).mockResolvedValue({
      gitVersion: 'v1.28.0',
    } as any);

    renderVersionButton();

    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('v1.28.0');

    // Mock second fetch with higher version
    vi.mocked(getVersion).mockResolvedValue({
      gitVersion: 'v1.29.0',
    } as any);

    // Invalidate query to trigger refetch
    await queryClient.invalidateQueries({ queryKey: ['version', 'test-cluster'] });

    // Expect snackbar with interpolated version to appear
    expect(await screen.findByText('Cluster version upgraded to v1.29.0')).toBeInTheDocument();
  });

  it('shows snackbar when cluster version is downgraded', async () => {
    // Initial fetch
    vi.mocked(getVersion).mockResolvedValue({
      gitVersion: 'v1.29.0',
    } as any);

    renderVersionButton();

    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('v1.29.0');

    // Mock second fetch with lower version
    vi.mocked(getVersion).mockResolvedValue({
      gitVersion: 'v1.28.0',
    } as any);

    // Invalidate query to trigger refetch
    await queryClient.invalidateQueries({ queryKey: ['version', 'test-cluster'] });

    // Expect snackbar with interpolated version to appear
    expect(await screen.findByText('Cluster version downgraded to v1.28.0')).toBeInTheDocument();
  });

  it('does not show snackbar when cluster version is unchanged on refetch', async () => {
    // Initial fetch
    vi.mocked(getVersion).mockResolvedValue({
      gitVersion: 'v1.28.0',
    } as any);

    renderVersionButton();

    const button = await screen.findByRole('button');
    expect(button).toHaveTextContent('v1.28.0');

    // Mock second fetch with the same version
    vi.mocked(getVersion).mockResolvedValue({
      gitVersion: 'v1.28.0',
    } as any);

    // Invalidate query to trigger refetch
    await queryClient.invalidateQueries({ queryKey: ['version', 'test-cluster'] });

    // Wait until refetch query settles
    await waitFor(() => {
      expect(queryClient.isFetching({ queryKey: ['version', 'test-cluster'] })).toBe(0);
    });

    // Expect neither upgrade nor downgrade snackbar to appear
    expect(screen.queryByText(/Cluster version (upgraded|downgraded) to/)).not.toBeInTheDocument();
  });
});
