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
import { describe, expect, it, vi } from 'vitest';
import type { RevisionInfo, RollbackResult } from '../../../lib/k8s/rollback';
import { TestContext } from '../../../test';
import type { RollbackableResource } from './RollbackButton';
import RollbackDialog from './RollbackDialog';

// The preview window shows the YAML in Monaco, which doesn't run in jsdom. Its title is enough here.
vi.mock('./DryRunPreviewDialog', () => ({
  default: ({ open, title }: { open: boolean; title: string }) =>
    open ? <div>{title}</div> : null,
}));

const revisions: RevisionInfo[] = [
  { revision: 2, createdAt: '2026-10-26T10:00:00Z', images: ['nginx:1.28'], isCurrent: true },
  { revision: 1, createdAt: '2026-10-25T10:00:00Z', images: ['nginx:1.27'], isCurrent: false },
];

function setup() {
  let resolvePreview: (result: RollbackResult) => void = () => {};
  const rollback = vi.fn(
    () =>
      new Promise<RollbackResult>(resolve => {
        resolvePreview = resolve;
      })
  );
  const resource = { rollback } as unknown as RollbackableResource;
  const getRevisionHistory = () => Promise.resolve(revisions);

  const dialog = (open: boolean) => (
    <TestContext>
      <RollbackDialog
        open={open}
        resourceKind="Deployment"
        resourceName="web"
        resource={resource}
        getRevisionHistory={getRevisionHistory}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </TestContext>
  );

  const finishPreview = () =>
    act(async () => {
      resolvePreview({
        success: true,
        message: '',
        dryRunResult: { kind: 'Deployment', metadata: { name: 'web' } } as any,
      });
    });

  return { dialog, rollback, finishPreview };
}

describe('RollbackDialog', () => {
  it('opens the preview once the dry run finishes', async () => {
    const { dialog, finishPreview } = setup();
    render(dialog(true));

    fireEvent.click(await screen.findByTestId('preview-button'));
    await finishPreview();

    expect(screen.getByText(/Dry-Run Preview/)).toBeInTheDocument();
  });

  it('does not open the preview when the dialog was closed before the dry run finished', async () => {
    const { dialog, rollback, finishPreview } = setup();
    const { rerender } = render(dialog(true));

    fireEvent.click(await screen.findByTestId('preview-button'));
    expect(rollback).toHaveBeenCalledWith({ toRevision: 1, dryRun: true });

    rerender(dialog(false));
    await finishPreview();

    expect(screen.queryByText(/Dry-Run Preview/)).not.toBeInTheDocument();
  });

  it('lets the preview run again after reopening the dialog', async () => {
    const { dialog } = setup();
    const { rerender } = render(dialog(true));

    fireEvent.click(await screen.findByTestId('preview-button'));
    rerender(dialog(false));
    rerender(dialog(true));

    expect(await screen.findByTestId('preview-button')).toHaveTextContent('Preview');
    expect(screen.getByTestId('preview-button')).toBeEnabled();
  });
});
