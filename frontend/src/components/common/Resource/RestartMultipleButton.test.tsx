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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { TestContext } from '../../../test';
import { RestartableResource } from './RestartButton';
import RestartMultipleButton from './RestartMultipleButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function makeResource(name: string, allowed: boolean) {
  return {
    kind: 'Deployment',
    cluster: '',
    metadata: { uid: `uid-${name}`, name, namespace: 'default' },
    patch: vi.fn(async () => undefined),
    getAuthorization: vi.fn(async () => ({ status: { allowed, reason: '' } })),
  } as unknown as RestartableResource & { getAuthorization: ReturnType<typeof vi.fn> };
}

function renderButton(items: RestartableResource[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <RestartMultipleButton items={items} />
      </TestContext>
    </QueryClientProvider>
  );
}

describe('RestartMultipleButton', () => {
  it('checks the patch permission for every selected item', async () => {
    const items = [makeResource('web', true), makeResource('api', true)];
    renderButton(items);

    await screen.findByLabelText('translation|Restart items');
    items.forEach(item => expect(item.getAuthorization).toHaveBeenCalledWith('patch'));
  });

  it('renders nothing when the user cannot restart any of the selected items', async () => {
    const items = [makeResource('web', false), makeResource('api', false)];
    const { container } = renderButton(items);

    // Wait for every RBAC check to resolve before asserting the button stays hidden.
    await waitFor(() => items.forEach(item => expect(item.getAuthorization).toHaveBeenCalled()));
    expect(container).toBeEmptyDOMElement();
  });

  it('only offers to restart the items the user is authorized to restart', async () => {
    renderButton([makeResource('web', true), makeResource('api', false)]);

    fireEvent.click(await screen.findByLabelText('translation|Restart items'));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('web')).toBeInTheDocument();
    expect(within(dialog).queryByText('api')).not.toBeInTheDocument();
  });
});
