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
import { render, screen } from '@testing-library/react';
import { ReactNode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { TestContext } from '../../test';
import AllowedNamespacesSelectorGate from './AllowedNamespacesSelectorGate';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

// Tracks how many times the wrapped child mounts, to catch a regression where
// gating on a cluster list that starts empty and later gets populated
// (e.g. while cluster config is still loading) remounts the routed subtree
// and destroys its state instead of updating it in place.
function MountCounter({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount();
  }, [onMount]);

  return <div>content</div>;
}

function renderWithProviders(children: ReactNode, queryClient: QueryClient) {
  return render(
    <TestContext>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TestContext>
  );
}

describe('AllowedNamespacesSelectorGate', () => {
  it('does not remount children when the clusters prop changes from empty to populated', async () => {
    const onMount = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { rerender } = renderWithProviders(
      <AllowedNamespacesSelectorGate clusters={[]}>
        <MountCounter onMount={onMount} />
      </AllowedNamespacesSelectorGate>,
      queryClient
    );

    expect(await screen.findByText('content')).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    rerender(
      <TestContext>
        <QueryClientProvider client={queryClient}>
          <AllowedNamespacesSelectorGate clusters={['cluster-a']}>
            <MountCounter onMount={onMount} />
          </AllowedNamespacesSelectorGate>
        </QueryClientProvider>
      </TestContext>
    );

    expect(await screen.findByText('content')).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('renders children directly when there are no clusters to resolve', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithProviders(
      <AllowedNamespacesSelectorGate clusters={[]}>
        <div>gated content</div>
      </AllowedNamespacesSelectorGate>,
      queryClient
    );

    expect(screen.getByText('gated content')).toBeInTheDocument();
  });
});
