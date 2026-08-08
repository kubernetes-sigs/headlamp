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
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../../test';
import EditButton from './EditButton';

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
});
