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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../test';

// Mocks must be declared before importing the module under test
vi.mock('./index', () => ({
  fetchAndExecutePlugins: vi.fn(() => Promise.resolve()),
  initializePlugins: vi.fn(() => Promise.resolve()),
}));

let mockClusterValue: string | null = null;
vi.mock('../lib/k8s', () => ({
  useCluster: () => mockClusterValue,
}));

import { fetchAndExecutePlugins, initializePlugins } from './index';
import Plugins from './Plugins';

const mockFetch = fetchAndExecutePlugins as ReturnType<typeof vi.fn>;
const mockInit = initializePlugins as ReturnType<typeof vi.fn>;

describe('Plugins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClusterValue = null;
    mockFetch.mockResolvedValue(undefined);
    mockInit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockClusterValue = null;
  });

  it('fetches and executes plugins on mount', () => {
    render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('calls initializePlugins when cluster becomes available after no-cluster initial load', async () => {
    // Initial render: no cluster in URL
    mockClusterValue = null;

    const { rerender } = render(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockInit).not.toHaveBeenCalled();

    // Cluster becomes available (user logs in, URL changes to /c/main/...)
    mockClusterValue = 'main';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    // pluginsReady is set asynchronously once fetchAndExecutePlugins resolves,
    // so we wait for initializePlugins to be called.
    await waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));
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
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    expect(mockInit).not.toHaveBeenCalled();

    // Cluster changes (e.g. user switches cluster) — should still NOT call
    mockClusterValue = 'other-cluster';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockInit).not.toHaveBeenCalled();
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
    await waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1));

    // Subsequent re-renders with a different cluster must not call initializePlugins again
    mockClusterValue = 'other-cluster';
    rerender(
      <TestContext>
        <Plugins />
      </TestContext>
    );

    expect(mockInit).toHaveBeenCalledTimes(1);
  });
});
