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
import { TestContext } from '../test';
import Plugins from './Plugins';

const { mockFetchAndExecutePlugins, mockEnqueueSnackbar } = vi.hoisted(() => ({
  mockFetchAndExecutePlugins: vi.fn(),
  mockEnqueueSnackbar: vi.fn(),
}));

vi.mock('./index', () => ({
  fetchAndExecutePlugins: mockFetchAndExecutePlugins,
}));

vi.mock('notistack', () => ({
  useSnackbar: () => ({
    enqueueSnackbar: mockEnqueueSnackbar,
    closeSnackbar: vi.fn(),
  }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Silence expected console.error calls in tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
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
});
