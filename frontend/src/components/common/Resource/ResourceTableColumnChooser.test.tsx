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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ResourceTableColumn } from './ResourceTable';
import ColumnsPopup from './ResourceTableColumnChooser';

const columns: ResourceTableColumn<any>[] = [
  { id: 'name', label: 'Name', show: true, getValue: () => '' },
  { id: 'status', label: 'Status', show: false, getValue: () => '' },
];

function renderPopup(onToggleColumn = vi.fn()) {
  render(
    <ColumnsPopup
      columns={columns}
      onToggleColumn={onToggleColumn}
      onClose={vi.fn()}
      anchorEl={document.body}
    />
  );
  return onToggleColumn;
}

it('names each checkbox after its column and reflects its visibility', () => {
  renderPopup();

  expect(screen.getByRole('checkbox', { name: 'Name' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Status' })).not.toBeChecked();
});

it('has no interactive element nested inside another one', () => {
  renderPopup();

  for (const widget of screen.getAllByRole('checkbox')) {
    expect(widget.closest('[role="button"], button')).toBeNull();
  }
});

it('puts only list items directly inside the list', () => {
  renderPopup();

  const list = screen.getByRole('list');
  expect([...list.children].map(child => child.tagName)).toEqual(['LI', 'LI']);
});

it('toggles the column when the label is clicked', async () => {
  const onToggleColumn = renderPopup();

  await userEvent.click(screen.getByText('Status'));

  expect(onToggleColumn).toHaveBeenCalledWith([
    expect.objectContaining({ id: 'name', show: true }),
    expect.objectContaining({ id: 'status', show: true }),
  ]);
});
