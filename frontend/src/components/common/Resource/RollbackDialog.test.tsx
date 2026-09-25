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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RevisionInfo } from '../../../lib/k8s/rollback';
import { TestContext } from '../../../test';
import type { RollbackableResource } from './RollbackButton';
import RollbackDialog from './RollbackDialog';

const revisions: RevisionInfo[] = [
  { revision: 4, createdAt: '2023-01-04T11:00:00Z', images: ['nginx:1.25.4'], isCurrent: true },
  { revision: 3, createdAt: '2023-01-03T09:30:00Z', images: ['nginx:1.25.3'], isCurrent: false },
  { revision: 2, createdAt: '2023-01-02T14:10:00Z', images: ['nginx:1.25.2'], isCurrent: false },
  { revision: 1, createdAt: '2023-01-01T08:00:00Z', images: ['nginx:1.25.1'], isCurrent: false },
];

const resource = {
  rollback: vi.fn(async () => ({ success: true, message: 'ok' })),
} as unknown as RollbackableResource;

function renderDialog(history: RevisionInfo[] = revisions) {
  return render(
    <TestContext>
      <RollbackDialog
        open
        resourceKind="Deployment"
        resourceName="nginx-deployment"
        resource={resource}
        getRevisionHistory={() => Promise.resolve(history)}
        onClose={() => {}}
        onConfirm={() => {}}
      />
    </TestContext>
  );
}

async function selectableRadios() {
  const radios = await screen.findAllByRole('radio');
  return radios.filter(radio => !radio.hasAttribute('aria-disabled'));
}

describe('RollbackDialog revision picker', () => {
  it('exposes the revisions as a single-tab-stop radio group', async () => {
    renderDialog();

    const selectable = await selectableRadios();

    await waitFor(() => expect(selectable[0]).toHaveAttribute('aria-checked', 'true'));

    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(selectable.filter(radio => radio.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('moves focus with the selection on ArrowDown and ArrowUp', async () => {
    renderDialog();

    const selectable = await selectableRadios();

    await waitFor(() => expect(selectable[0]).toHaveAttribute('aria-checked', 'true'));

    selectable[0].focus();
    await userEvent.keyboard('{ArrowDown}');

    await waitFor(() => expect(selectable[1]).toHaveAttribute('aria-checked', 'true'));
    expect(selectable[1]).toHaveFocus();
    expect(selectable[1]).toHaveAttribute('tabindex', '0');
    expect(selectable[0]).toHaveAttribute('aria-checked', 'false');
    expect(selectable[0]).toHaveAttribute('tabindex', '-1');

    await userEvent.keyboard('{ArrowUp}');

    await waitFor(() => expect(selectable[0]).toHaveAttribute('aria-checked', 'true'));
    expect(selectable[0]).toHaveFocus();
  });

  it('does not steal focus later when there is only one selectable revision', async () => {
    const onlyOneSelectable = [
      { revision: 2, createdAt: '2023-01-02T14:10:00Z', images: ['nginx:1.25.2'], isCurrent: true },
      {
        revision: 1,
        createdAt: '2023-01-01T08:00:00Z',
        images: ['nginx:1.25.1'],
        isCurrent: false,
      },
    ];
    renderDialog(onlyOneSelectable);

    const selectable = await selectableRadios();
    expect(selectable).toHaveLength(1);

    await waitFor(() => expect(selectable[0]).toHaveAttribute('aria-checked', 'true'));

    // Every arrow lands back on the same revision, so nothing should be queued.
    selectable[0].focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowUp}');

    // Move on to another control, then cause an unrelated re-render.
    const previewButton = screen.getByTestId('preview-button');
    await waitFor(() => expect(previewButton).toBeEnabled());
    previewButton.focus();
    await userEvent.click(previewButton);

    await waitFor(() => expect(resource.rollback).toHaveBeenCalled());

    expect(selectable[0]).not.toHaveFocus();
  });

  it('wraps around at the ends of the group', async () => {
    renderDialog();

    const selectable = await selectableRadios();

    await waitFor(() => expect(selectable[0]).toHaveAttribute('aria-checked', 'true'));

    selectable[0].focus();
    await userEvent.keyboard('{ArrowUp}');

    const last = selectable[selectable.length - 1];

    await waitFor(() => expect(last).toHaveAttribute('aria-checked', 'true'));
    expect(last).toHaveFocus();
  });
});
