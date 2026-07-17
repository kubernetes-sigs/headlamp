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

function mockItem(patchAllowed: boolean) {
  return {
    _class: () => ({
      apiName: 'namespaces',
      apiVersion: 'v1',
    }),
    getName: () => 'test-ns',
    getNamespace: () => '',
    getAuthorization: vi.fn(() =>
      Promise.resolve({
        status: {
          allowed: patchAllowed,
          reason: 'Forbidden',
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
    renderWithProviders(<EditButton item={mockItem(true)} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    });
  });

  it('does not show edit button when user lacks patch permission', async () => {
    renderWithProviders(<EditButton item={mockItem(false)} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view yaml/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });
});
