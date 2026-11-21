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

import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import * as cluster from '../../lib/cluster';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import * as discoveredRevisions from '../../lib/k8s/api/v2/discoveredConnectionRevisions';
import {
  DISCOVERY_CONNECTION_CHANGED,
  getDiscoveryRequestBinding,
} from '../../lib/k8s/api/v2/discoveryConnection';
import Namespace from '../../lib/k8s/namespace';
import { clusterAction } from '../../redux/clusterActionSlice';
import { TestContext } from '../../test';
import CreateNamespaceButton from './CreateNamespaceButton';

vi.mock('../common/Resource', () => ({
  AuthVisible: ({ children }: React.PropsWithChildren) => children,
}));

vi.mock('../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/clusterActionSlice')>()),
  clusterAction: vi.fn(() => ({ type: 'clusterAction/test' })),
}));

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps the captured revision and reports a proxy connection error', async () => {
  vi.spyOn(cluster, 'getCluster').mockReturnValue('discovered');
  vi.spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision').mockReturnValue('original:1');
  const post = vi
    .spyOn(Namespace.apiEndpoint, 'post')
    .mockRejectedValue(new ApiError(`Conflict - ${DISCOVERY_CONNECTION_CHANGED}`, { status: 409 }));

  render(
    <TestContext>
      <CreateNamespaceButton />
    </TestContext>
  );
  fireEvent.click(screen.getByLabelText('Create Namespace'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'example' } });
  fireEvent.click(screen.getByTestId('create-namespace-dialog-create-button'));

  const [create] = vi.mocked(clusterAction).mock.lastCall!;
  await act(async () => {
    await expect(create()).rejects.toThrow(DISCOVERY_CONNECTION_CHANGED);
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ metadata: { name: 'example' } }),
    { __headlamp_connection_revision: 'original' },
    'discovered'
  );
  expect(getDiscoveryRequestBinding(post.mock.calls[0][1])).toEqual({ revision: 'original:1' });
  expect(screen.queryByText('A namespace with this name already exists.')).toBeNull();
});

it.each([
  { beforeConfirmation: true, initial: 'original:1', replacement: 'original:2' },
  { beforeConfirmation: false, initial: 'original:1', replacement: 'original:2' },
  { beforeConfirmation: false, initial: undefined, replacement: 'original:1' },
])(
  'rejects a namespace create after the connection changes (before confirm: $beforeConfirmation, initial: $initial)',
  async ({ beforeConfirmation, initial, replacement }) => {
    vi.spyOn(cluster, 'getCluster').mockReturnValue('selected');
    const revision = vi
      .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
      .mockReturnValue(initial);
    const post = vi.spyOn(Namespace.apiEndpoint, 'post').mockResolvedValue({});
    render(
      <TestContext>
        <CreateNamespaceButton />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('Create Namespace'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'example' },
    });
    if (beforeConfirmation) revision.mockReturnValue(replacement);
    fireEvent.click(screen.getByTestId('create-namespace-dialog-create-button'));
    revision.mockReturnValue(replacement);

    const [create] = vi.mocked(clusterAction).mock.lastCall!;
    await act(async () => {
      await expect(create()).rejects.toMatchObject({
        status: 409,
        message: DISCOVERY_CONNECTION_CHANGED,
      });
    });
    expect(post).not.toHaveBeenCalled();
    expect(screen.queryByText('A namespace with this name already exists.')).toBeNull();
  }
);
