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
import { DISCOVERY_CONNECTION_CHANGED } from '../../lib/k8s/api/v2/discoveryConnection';
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

it('uses the connection selected before namespace creation was deferred', async () => {
  vi.spyOn(cluster, 'getCluster').mockReturnValue('discovered');
  const revision = vi
    .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
    .mockReturnValue('original:1');
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

  revision.mockReturnValue('replacement:2');
  const [create] = vi.mocked(clusterAction).mock.lastCall!;
  await act(async () => {
    await expect(create()).rejects.toThrow(DISCOVERY_CONNECTION_CHANGED);
  });

  expect(post).toHaveBeenCalledWith(
    expect.objectContaining({ metadata: { name: 'example' } }),
    { __headlamp_connection_revision: 'original' },
    'discovered'
  );
  expect(screen.queryByText('A namespace with this name already exists.')).toBeNull();
});
