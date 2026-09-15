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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MRT_Column, MRT_TableInstance } from 'material-react-table';
import { expect, test, vi } from 'vitest';
import { ColumnVisibilityButton } from './ColumnVisibilityButton';

type Row = Record<string, unknown>;

function makeColumn(
  id: string,
  options: {
    canHide?: boolean;
    columnDef?: Partial<MRT_Column<Row>['columnDef']>;
    isVisible?: boolean;
  } = {}
) {
  return {
    id,
    columnDef: { header: id, ...options.columnDef },
    getCanHide: () => options.canHide ?? true,
    getIsVisible: () => options.isVisible ?? true,
    toggleVisibility: vi.fn(),
  } as unknown as MRT_Column<Row>;
}

function makeTable(columns: MRT_Column<Row>[]) {
  return {
    options: {
      icons: { ViewColumnIcon: () => <span /> },
      localization: {
        hideAll: 'Hide all',
        showAll: 'Show all',
        showHideColumns: 'Show or hide columns',
      },
    },
    getAllLeafColumns: () => columns,
  } as unknown as MRT_TableInstance<Row>;
}

test('exposes the menu state and closes it with Escape', async () => {
  render(<ColumnVisibilityButton table={makeTable([makeColumn('Name')])} />);

  const button = screen.getByRole('button', { name: 'Show or hide columns' });
  expect(button).not.toHaveAttribute('aria-expanded');
  expect(button).not.toHaveAttribute('aria-controls');

  fireEvent.click(button);

  expect(button).toHaveAttribute('aria-expanded', 'true');
  const controlledMenu = document.getElementById(button.getAttribute('aria-controls')!);
  expect(controlledMenu).toContainElement(screen.getByRole('menu'));

  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  expect(button).not.toHaveAttribute('aria-expanded');
});

test('only lists eligible columns as keyboard-accessible menu items', () => {
  const name = makeColumn('Name');
  const locked = makeColumn('Locked', { canHide: false, isVisible: false });
  const hidingDisabled = makeColumn('Hiding disabled', {
    columnDef: { enableHiding: false },
  });
  const omitted = makeColumn('Omitted', {
    columnDef: { visibleInShowHideMenu: false },
  });
  const display = makeColumn('Display', {
    columnDef: { columnDefType: 'display' },
  });

  render(
    <ColumnVisibilityButton table={makeTable([name, locked, hidingDisabled, omitted, display])} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show or hide columns' }));

  const nameItem = screen.getByRole('menuitemcheckbox', { name: 'Name', checked: true });
  expect(nameItem).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('menuitemcheckbox', { name: 'Locked', checked: false })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(2);
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(nameItem.querySelector('input')).toHaveAttribute('tabindex', '-1');
  expect(nameItem.querySelector('input')).toHaveAttribute('readonly');

  fireEvent.click(nameItem);
  expect(name.toggleVisibility).toHaveBeenCalledOnce();
});

test('hides and shows every hideable column', () => {
  const name = makeColumn('Name');
  const age = makeColumn('Age', { isVisible: false });
  const locked = makeColumn('Locked', { canHide: false });

  render(<ColumnVisibilityButton table={makeTable([name, age, locked])} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show or hide columns' }));

  fireEvent.click(screen.getByRole('menuitem', { name: 'Hide all' }));
  expect(name.toggleVisibility).toHaveBeenCalledWith(false);
  expect(age.toggleVisibility).toHaveBeenCalledWith(false);
  expect(locked.toggleVisibility).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('menuitem', { name: 'Show all' }));
  expect(name.toggleVisibility).toHaveBeenLastCalledWith(true);
  expect(age.toggleVisibility).toHaveBeenLastCalledWith(true);
});

test('disables bulk actions when they cannot change visibility', () => {
  render(<ColumnVisibilityButton table={makeTable([makeColumn('Locked', { canHide: false })])} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show or hide columns' }));

  expect(screen.getByRole('menuitem', { name: 'Hide all' })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  expect(screen.getByRole('menuitem', { name: 'Show all' })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
});

test('derives bulk action availability from hideable columns', () => {
  render(
    <ColumnVisibilityButton
      table={makeTable([
        makeColumn('Locked', { canHide: false, isVisible: true }),
        makeColumn('Hidden', { isVisible: false }),
      ])}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show or hide columns' }));

  expect(screen.getByRole('menuitem', { name: 'Hide all' })).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  expect(screen.getByRole('menuitem', { name: 'Show all' })).not.toHaveAttribute(
    'aria-disabled',
    'true'
  );
});
