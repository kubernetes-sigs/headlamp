/*
 * Copyright 2026 The Kubernetes Authors
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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import * as discoveredRevisions from '../../../lib/k8s/api/v2/discoveredConnectionRevisions';
import { recordDiscoveryConnection } from '../../../lib/k8s/api/v2/discoveryConnection';
import Deployment from '../../../lib/k8s/deployment';
import type { RollbackResult } from '../../../lib/k8s/rollback';
import { clusterAction } from '../../../redux/clusterActionSlice';
import { TestContext } from '../../../test';
import RollbackButton from './RollbackButton';

vi.mock('./AuthVisible', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}));

vi.mock('../../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../redux/clusterActionSlice')>()),
  clusterAction: vi.fn(() => ({ type: 'clusterAction/test' })),
}));

afterEach(() => vi.restoreAllMocks());

it.each(['before preview', 'during preview'])(
  'rejects preview for an unstamped workload when the connection changes %s',
  async when => {
    const original = new Deployment(Deployment.getBaseObject(), 'discovered');
    const revision = vi
      .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
      .mockReturnValue('same:1');
    vi.spyOn(original, 'getRevisionHistory').mockResolvedValue([
      { revision: 1, createdAt: '2026-01-01T00:00:00Z', images: [], isCurrent: false },
    ]);
    const pending = Promise.withResolvers<RollbackResult>();
    const rollback = vi.spyOn(original, 'rollback').mockReturnValue(pending.promise);
    render(
      <TestContext>
        <RollbackButton item={original} />
      </TestContext>
    );
    fireEvent.click(screen.getByLabelText('Rollback'));
    const preview = await screen.findByRole('button', { name: /preview/i });
    await waitFor(() => expect(preview).toBeEnabled());

    if (when === 'before preview') {
      revision.mockReturnValue('same:2');
      fireEvent.click(preview);
      expect(rollback).not.toHaveBeenCalled();
    } else {
      fireEvent.click(preview);
      expect(rollback).toHaveBeenCalledWith({ toRevision: 1, dryRun: true });
      revision.mockReturnValue('same:2');
      await act(async () =>
        pending.resolve({ success: true, message: 'ok', dryRunResult: Deployment.getBaseObject() })
      );
    }

    expect(await screen.findByText(/discovered cluster connection changed/i)).toBeInTheDocument();
  }
);

it('does not roll back a replacement workload from the already open dialog', async () => {
  const cluster = 'discovered';
  const original = new Deployment(Deployment.getBaseObject(), cluster);
  const replacement = new Deployment(Deployment.getBaseObject(), cluster);
  recordDiscoveryConnection(original, cluster, 'same:1');
  recordDiscoveryConnection(replacement, cluster, 'same:2');
  const revision = vi
    .spyOn(discoveredRevisions, 'getDiscoveredConnectionRevision')
    .mockReturnValue('same:1');
  const history = [
    { revision: 1, createdAt: '2026-01-01T00:00:00Z', images: [], isCurrent: false },
  ];
  vi.spyOn(original, 'getRevisionHistory').mockResolvedValue(history);
  vi.spyOn(replacement, 'getRevisionHistory').mockResolvedValue(history);
  const rollbackOriginal = vi
    .spyOn(original, 'rollback')
    .mockResolvedValue({ success: true, message: 'ok' });
  const rollbackReplacement = vi
    .spyOn(replacement, 'rollback')
    .mockResolvedValue({ success: true, message: 'ok' });
  const content = (item: Deployment) => (
    <TestContext>
      <RollbackButton item={item} />
    </TestContext>
  );
  const { rerender } = render(content(original));
  fireEvent.click(screen.getByLabelText('Rollback'));
  await waitFor(() => expect(screen.getByTestId('confirm-button')).toBeEnabled());

  revision.mockReturnValue('same:2');
  rerender(content(replacement));
  await waitFor(() => expect(screen.getByTestId('confirm-button')).toBeEnabled());
  fireEvent.click(screen.getByTestId('confirm-button'));
  const [rollback] = vi.mocked(clusterAction).mock.lastCall!;

  await act(async () => {
    await expect(rollback()).rejects.toMatchObject({ status: 409 });
  });
  expect(rollbackOriginal).not.toHaveBeenCalled();
  expect(rollbackReplacement).not.toHaveBeenCalled();
});
