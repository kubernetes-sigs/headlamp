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
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, vars?: { name?: string }) =>
        vars?.name ? key.replace('{{ name }}', vars.name) : key,
    }),
  };
});

// Stub out CreateResourceButton so we don't drag in the Activity / EditorDialog
// chain. The stub is enough to prove EmptyStateActions renders it (or omits
// it) based on the resourceClass prop. The real labeled variant is exercised
// in CreateResourceButton.test.tsx.
vi.mock('../CreateResourceButton', () => ({
  CreateResourceButton: ({ variant }: { variant?: string }) => (
    <button data-testid="create-btn" data-variant={variant}>
      Create
    </button>
  ),
}));

import { EmptyStateActions } from './EmptyStateActions';

// Realistic-shape stand-in for a KubeObjectClass. Enough to satisfy the
// `resourceClass.kind` and `resourceClass.apiName` reads that the real
// CreateResourceButton (mocked here) would perform.
const podClass = { kind: 'Pod', apiName: 'pods', apiVersion: 'v1' } as any;

function renderWith(ui: React.ReactElement, client?: QueryClient) {
  const c = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={c}>{ui}</QueryClientProvider>);
}

describe('EmptyStateActions', () => {
  it('renders Create + Refresh when a resourceClass with a kind is provided', () => {
    renderWith(<EmptyStateActions resourceClass={podClass} />);
    const create = screen.getByTestId('create-btn');
    expect(create).toBeInTheDocument();
    expect(create.getAttribute('data-variant')).toBe('labeled');
    expect(screen.getByRole('button', { name: /Refresh list/i })).toBeInTheDocument();
  });

  it('renders only Refresh when no resourceClass is provided', () => {
    renderWith(<EmptyStateActions />);
    expect(screen.queryByTestId('create-btn')).toBeNull();
    expect(screen.getByRole('button', { name: /Refresh list/i })).toBeInTheDocument();
  });

  it('omits Create when resourceClass is present but has no kind', () => {
    const partialClass = { apiName: 'x' } as any;
    renderWith(<EmptyStateActions resourceClass={partialClass} />);
    expect(screen.queryByTestId('create-btn')).toBeNull();
    expect(screen.getByRole('button', { name: /Refresh list/i })).toBeInTheDocument();
  });

  it('refetches only kube-object list queries when Refresh is clicked', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'refetchQueries').mockResolvedValue();
    renderWith(<EmptyStateActions />, client);
    fireEvent.click(screen.getByRole('button', { name: /Refresh list/i }));

    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0][0] as { type: string; predicate: (q: any) => boolean };
    expect(args.type).toBe('active');
    // The predicate must accept list queries and reject anything else so the
    // click doesn't also refetch auth / discovery / sidebar queries.
    const listQuery = { queryKey: ['kubeObject', 'list', 'v1', 'pods', 'c', ''] };
    const objectQuery = { queryKey: ['object', 'c', {}, '', 'p'] };
    const authQuery = { queryKey: ['auth', 'me'] };
    expect(args.predicate(listQuery as any)).toBe(true);
    expect(args.predicate(objectQuery as any)).toBe(false);
    expect(args.predicate(authQuery as any)).toBe(false);
  });

  it('disables the button and swaps label while a refresh is in flight', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveRefetch: () => void = () => {};
    vi.spyOn(client, 'refetchQueries').mockImplementation(
      () => new Promise<void>(resolve => (resolveRefetch = resolve))
    );
    try {
      renderWith(<EmptyStateActions />, client);
      const btn = screen.getByRole('button', { name: /Refresh list/i });
      fireEvent.click(btn);

      // In flight: label flips to Refreshing and the button is disabled so
      // repeated clicks can't stack refetches.
      expect(btn).toHaveTextContent('Refreshing');
      expect(btn).toBeDisabled();

      // Resolve the refetch and the min-visible timer so the loading state
      // clears.
      await act(async () => {
        resolveRefetch();
        vi.advanceTimersByTime(500);
      });

      await waitFor(() => expect(btn).not.toBeDisabled());
      expect(btn).toHaveTextContent('Refresh');
    } finally {
      vi.useRealTimers();
    }
  });
});
