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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Namespace from '../../lib/k8s/namespace';
import { TestContext } from '../../test';
import CreateNamespaceButton from './CreateNamespaceButton';

// clusterAction defers the request by a grace period, so capture the callback and run it directly.
const capturedAction: { current: (() => Promise<unknown>) | null } = { current: null };

vi.mock('../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/clusterActionSlice')>()),
  clusterAction: vi.fn((action: () => Promise<unknown>) => {
    capturedAction.current = action;
    return { type: 'clusterAction/test' };
  }),
}));

// Depending on the imports, labels render translated or as namespace|key.
const OPEN_BUTTON_LABEL = /Create Namespace$/;

function renderButton(clusterParam: string) {
  // getCluster() reads window.location rather than the router, so keep them in sync.
  window.history.pushState({}, '', `/c/${clusterParam}`);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext urlPrefix="/c" routerMap={{ cluster: clusterParam }}>
        <CreateNamespaceButton />
      </TestContext>
    </QueryClientProvider>
  );
}

async function createNamespace(name: string) {
  fireEvent.click(await screen.findByLabelText(OPEN_BUTTON_LABEL));
  await userEvent.type(await screen.findByRole('textbox'), name);
  fireEvent.click(screen.getByTestId('create-namespace-dialog-create-button'));
  expect(capturedAction.current).not.toBeNull();
  await capturedAction.current!();
}

describe('CreateNamespaceButton', () => {
  const post = vi.fn();
  let allowedClusters: string[];

  beforeEach(() => {
    capturedAction.current = null;
    post.mockReset().mockResolvedValue({});
    allowedClusters = ['cluster-a', 'cluster-b'];
    vi.spyOn(Namespace, 'apiEndpoint', 'get').mockReturnValue({ post } as any);
    vi.spyOn(Namespace, 'getAuthorization').mockImplementation(
      async (_verb, _attrs, cluster) =>
        ({ status: { allowed: allowedClusters.includes(cluster ?? '') } } as any)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('creates the namespace in the cluster picked in the dialog', async () => {
    renderButton('cluster-a+cluster-b');

    fireEvent.click(await screen.findByLabelText(OPEN_BUTTON_LABEL));
    fireEvent.mouseDown(await screen.findByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'cluster-b' }));
    await userEvent.type(screen.getByRole('textbox'), 'demo');
    fireEvent.click(screen.getByTestId('create-namespace-dialog-create-button'));
    await capturedAction.current!();

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0].metadata.name).toBe('demo');
    expect(post.mock.calls[0][2]).toBe('cluster-b');
  });

  it('defaults to the first cluster', async () => {
    renderButton('cluster-a+cluster-b');

    await createNamespace('demo');

    expect(post.mock.calls[0][2]).toBe('cluster-a');
  });

  it('only offers clusters where namespaces can be created', async () => {
    allowedClusters = ['cluster-b'];
    renderButton('cluster-a+cluster-b');

    fireEvent.click(await screen.findByLabelText(OPEN_BUTTON_LABEL));
    fireEvent.mouseDown(await screen.findByRole('combobox'));

    expect(await screen.findAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'cluster-b' })).toBeInTheDocument();
  });

  it('hides the button when no selected cluster allows creating namespaces', async () => {
    allowedClusters = [];
    renderButton('cluster-a+cluster-b');

    await waitFor(() => expect(Namespace.getAuthorization).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText(OPEN_BUTTON_LABEL)).not.toBeInTheDocument();
  });

  it('does not show a cluster selector with a single cluster', async () => {
    renderButton('cluster-a');

    fireEvent.click(await screen.findByLabelText(OPEN_BUTTON_LABEL));
    await screen.findByRole('textbox');

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'demo');
    fireEvent.click(screen.getByTestId('create-namespace-dialog-create-button'));
    await capturedAction.current!();

    expect(post.mock.calls[0][2]).toBe('cluster-a');
  });
});
