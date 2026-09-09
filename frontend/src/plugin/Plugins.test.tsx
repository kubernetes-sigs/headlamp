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

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../test';

const { mockFetchAndExecutePlugins, mockInitializePlugins, mockEnqueueSnackbar } = vi.hoisted(
  () => ({
    mockFetchAndExecutePlugins: vi.fn(),
    mockInitializePlugins: vi.fn(),
    mockEnqueueSnackbar: vi.fn(),
  })
);

vi.mock('./index', () => ({
  fetchAndExecutePlugins: mockFetchAndExecutePlugins,
  initializePlugins: mockInitializePlugins,
}));

vi.mock('notistack', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: mockEnqueueSnackbar,
    closeSnackbar: vi.fn(),
  }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let mockClusterValue: string | null = null;
vi.mock('../lib/k8s', () => ({
  useCluster: () => mockClusterValue,
}));

import Plugins from './Plugins';

// Silence expected console.error calls in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.clearAllMocks();
  mockClusterValue = null;
  mockFetchAndExecutePlugins.mockResolvedValue(undefined);
  mockInitializePlugins.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  mockClusterValue = null;
});

describe('Plugins', () => {
  test('shows an error snackbar when plugin loading fails', async () => {
    mockFetchAndExecutePlugins.mockRejectedValue(new Error('fetch failed'));

    render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load plugins'),
        expect.objectContaining({ variant: 'error' })
      );
    });
  });

  test('does not show error snackbar when plugin loading succeeds', async () => {
    mockFetchAndExecutePlugins.mockResolvedValue(undefined);

    render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    // Wait for the effect to run
    await waitFor(() => {
      expect(mockFetchAndExecutePlugins).toHaveBeenCalled();
    });

    expect(mockEnqueueSnackbar).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ variant: 'error' })
    );
  });

  it('calls initializePlugins when cluster becomes available after no-cluster initial load', async () => {
    // Initial render: no cluster in URL
    mockClusterValue = null;

    const { rerender } = render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockInitializePlugins).not.toHaveBeenCalled();

    // Cluster becomes available (user logs in, URL changes to /c/main/...)
    mockClusterValue = 'main';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    // pluginsReady is set asynchronously once fetchAndExecutePlugins resolves,
    // so we wait for initializePlugins to be called.
    await waitFor(() => expect(mockInitializePlugins).toHaveBeenCalledTimes(1));
  });

  it('does not call initializePlugins when cluster is already available at mount', async () => {
    // When the cluster is in the URL from the start, loadedWithoutCluster stays false
    // so the re-initialization effect must not fire.
    mockClusterValue = 'my-cluster';

    const { rerender } = render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    // Wait for pluginsReady to settle (fetchAndExecutePlugins mock resolves)
    await waitFor(() => expect(mockFetchAndExecutePlugins).toHaveBeenCalledTimes(1));

    expect(mockInitializePlugins).not.toHaveBeenCalled();

    // Cluster changes (e.g. user switches cluster) — should still NOT call
    mockClusterValue = 'other-cluster';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockInitializePlugins).not.toHaveBeenCalled();
  });

  it('only initializes once even if cluster value changes multiple times', async () => {
    mockClusterValue = null;

    const { rerender } = render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    mockClusterValue = 'main';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    // Wait for the one expected call (triggered after pluginsReady becomes true)
    await waitFor(() => expect(mockInitializePlugins).toHaveBeenCalledTimes(1));

    // Subsequent re-renders with a different cluster must not call initializePlugins again
    mockClusterValue = 'other-cluster';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockInitializePlugins).toHaveBeenCalledTimes(1);
  });
});
