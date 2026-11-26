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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import EditButton from './EditButton';

// Save-flow mocks: opening the editor goes through fetchLatestKubeObject,
// Activity.launch (renders EditorActivityContent), EditorDialog (save button)
// and clusterAction (runs the save). Mock the seams, keep the real branch:
// EditorActivityContent.updateFunc choosing patchUpdate vs update.
const { mockActivityLaunch, mockClusterAction, capturedSave } = vi.hoisted(() => ({
  mockActivityLaunch: vi.fn(),
  mockClusterAction: vi.fn((action: () => Promise<void>) => {
    capturedSave.current = action;
    return { type: 'clusterAction/test' };
  }),
  capturedSave: { current: undefined as (() => Promise<void>) | undefined },
}));

vi.mock('./fetchLatestKubeObject', () => ({
  fetchLatestKubeObject: (item: unknown) => Promise.resolve(item),
}));

vi.mock('../../activity/Activity', () => ({
  Activity: {
    launch: mockActivityLaunch,
    close: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('./EditorDialog', () => ({
  default: ({ item, onSave }: any) => <button onClick={() => onSave([item])}>Save</button>,
}));

vi.mock('../../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../redux/clusterActionSlice')>()),
  clusterAction: mockClusterAction,
}));

function mockItem(allowedVerbs: string[]) {
  return {
    _class: () => ({
      apiName: 'namespaces',
      apiVersion: 'v1',
    }),
    getName: () => 'test-ns',
    getNamespace: () => '',
    getAuthorization: vi.fn((verb: string) =>
      Promise.resolve({
        status: {
          allowed: allowedVerbs.includes(verb),
        },
      })
    ),
    metadata: {
      name: 'test-ns',
      uid: 'test-uid',
    },
    kind: 'Namespace',
    cluster: 'test-cluster',
    jsonData: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'test-ns' } },
    getEditableObject: () => ({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: 'test-ns' },
    }),
    patchUpdate: vi.fn(),
    update: vi.fn(),
  } as any;
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>{ui}</TestContext>
    </QueryClientProvider>
  );
}

describe('EditButton', () => {
  beforeEach(() => {
    mockActivityLaunch.mockClear();
    mockClusterAction.mockClear();
    capturedSave.current = undefined;
  });

  async function openEditorAndSave(item: any) {
    // EditorActivityContent reads the watch hook off item.constructor.
    item.constructor = { useGet: () => [item] };
    renderWithProviders(<EditButton item={item} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    await waitFor(() => {
      expect(mockActivityLaunch).toHaveBeenCalled();
    });
    renderWithProviders(mockActivityLaunch.mock.calls[0][0].content);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(capturedSave.current).toBeDefined();
    });
    await act(async () => {
      await capturedSave.current?.();
    });
  }

  it('shows edit button when user has patch permission', async () => {
    const item = mockItem(['patch']);
    renderWithProviders(<EditButton item={item} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
    expect(item.getAuthorization).toHaveBeenCalledWith('patch', {});
    // Short-circuits: 'update' is never checked when patch is granted.
    expect(item.getAuthorization).not.toHaveBeenCalledWith('update', {});
  });

  it('shows edit button when user has only update permission', async () => {
    const item = mockItem(['update']);
    renderWithProviders(<EditButton item={item} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
    expect(item.getAuthorization).toHaveBeenCalledWith('patch', {});
    expect(item.getAuthorization).toHaveBeenCalledWith('update', {});
  });

  it('shows edit button when user has both patch and update permission', async () => {
    const item = mockItem(['patch', 'update']);
    renderWithProviders(<EditButton item={item} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
    expect(item.getAuthorization).toHaveBeenCalledWith('patch', {});
  });

  it('does not show edit button when user has neither patch nor update permission', async () => {
    const item = mockItem([]);
    renderWithProviders(<EditButton item={item} />);
    // The view button renders immediately; wait for both auth checks to
    // complete so this test actually validates the final outcome.
    await waitFor(() => {
      expect(item.getAuthorization).toHaveBeenCalledWith('patch', {});
      expect(item.getAuthorization).toHaveBeenCalledWith('update', {});
    });
    expect(screen.getByRole('button', { name: /view yaml/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('saves with patchUpdate when user has patch permission', async () => {
    const item = mockItem(['patch', 'update']);
    await openEditorAndSave(item);
    expect(item.patchUpdate).toHaveBeenCalled();
    expect(item.update).not.toHaveBeenCalled();
  });

  it('saves with update when user has only update permission', async () => {
    const item = mockItem(['update']);
    await openEditorAndSave(item);
    expect(item.update).toHaveBeenCalled();
    expect(item.patchUpdate).not.toHaveBeenCalled();
  });
});
