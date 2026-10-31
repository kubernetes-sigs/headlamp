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

/**
 * Grouping runs against the real material-react-table, since Table renders the grouped
 * rows itself and depends on MRT's grouped and expanded row models to produce them.
 */

import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import Table, { TableColumn, TableProps } from './Table';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('../../../lib/useShortcut', () => ({ useShortcut: vi.fn() }));
vi.mock('../../../lib/util', () => ({
  useURLState: (_key: string, options: { defaultValue: number }) => [options.defaultValue, vi.fn()],
}));
vi.mock('../../../helpers/tablesRowsPerPage', () => ({
  getTablesRowsPerPage: () => 10,
  setTablesRowsPerPage: vi.fn(),
}));
vi.mock('../../App/Settings/hook', () => ({ useSettings: () => [10] }));
vi.mock('../../resourceMap/useQueryParamsState', () => ({
  useQueryParamsState: (_key: string, initialValue: unknown) => [initialValue, vi.fn()],
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

interface Item {
  name: string;
  team?: string;
}

const data: Item[] = [
  { name: 'charlie', team: 'blue' },
  { name: 'alpha', team: 'blue' },
  { name: 'bravo', team: 'red' },
];

const columns: TableColumn<Item>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name' },
  {
    id: 'team',
    header: 'Team',
    accessorFn: item => item.team ?? '',
    GroupedCell: ({ row }) => `team: ${row.groupingValue}`,
  },
];

function renderTable(props: Partial<TableProps<Item>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <Table
        columns={columns}
        data={data}
        enableGrouping
        initialState={{ expanded: true }}
        state={{ grouping: ['team'], columnVisibility: { team: false } }}
        {...props}
      />
    </ThemeProvider>
  );
}

function bodyRowTexts() {
  return screen
    .getAllByRole('row')
    .filter(row => row.closest('tbody'))
    .map(row => row.textContent);
}

describe('Table grouping', () => {
  it('renders a heading row with the group label and count before its rows', () => {
    renderTable({ state: { grouping: ['team'], columnVisibility: { team: false } } });

    expect(bodyRowTexts()).toEqual(['team: blue(2)', 'charlie', 'alpha', 'team: red(1)', 'bravo']);
  });

  it('sorts the rows within each group', () => {
    renderTable({
      state: {
        grouping: ['team'],
        columnVisibility: { team: false },
        sorting: [{ id: 'name', desc: false }],
      },
    });

    expect(bodyRowTexts()).toEqual(['team: blue(2)', 'alpha', 'charlie', 'team: red(1)', 'bravo']);
  });

  it('collapses and expands a group from its heading', () => {
    renderTable();

    const toggle = screen.getByRole('button', { name: 'team: blue (2)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);

    expect(bodyRowTexts()).toEqual(['team: blue(2)', 'team: red(1)', 'bravo']);
    expect(screen.getByRole('button', { name: 'team: blue (2)' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('does not add the expand column or drag handles to the header', () => {
    renderTable();

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Name');
    expect(screen.queryByRole('button', { name: /move/i })).not.toBeInTheDocument();
  });

  it('keeps drag handles when the caller enables column dragging', () => {
    renderTable({ enableColumnDragging: true });

    expect(screen.getAllByRole('button', { name: /move/i }).length).toBeGreaterThan(0);
  });
});

/** More rows than fit on one page (10 rows per page in these tests), in two groups. */
const largeData: Item[] = [
  ...Array.from({ length: 12 }, (_, index) => ({
    name: `blue-${String(index + 1).padStart(2, '0')}`,
    team: 'blue',
  })),
  ...Array.from({ length: 4 }, (_, index) => ({ name: `red-${index + 1}`, team: 'red' })),
];

function checkboxFor(name: string) {
  const row = screen
    .getAllByRole('row')
    .find(it => it.closest('tbody') && it.textContent === name)!;
  return within(row).getByRole('checkbox') as HTMLInputElement;
}

function selectAllCheckbox() {
  return within(screen.getAllByRole('columnheader')[0]).getByRole('checkbox') as HTMLInputElement;
}

describe('Table grouping with pagination and selection', () => {
  it('repeats the heading of a group that continues from the previous page', () => {
    renderTable({ data: largeData, initialPage: 2 });

    expect(bodyRowTexts()).toEqual([
      'team: blue(12)continued',
      'blue-10',
      'blue-11',
      'blue-12',
      'team: red(4)',
      'red-1',
      'red-2',
      'red-3',
      'red-4',
    ]);
  });

  it('does not repeat the heading when a page starts with it', () => {
    renderTable({ data: largeData });

    expect(bodyRowTexts().slice(0, 2)).toEqual(['team: blue(12)', 'blue-01']);
    expect(bodyRowTexts()).toHaveLength(10);
  });

  it('counts group headings as rows in the pager', () => {
    // Pages are made of rows, headings included, and MRT derives the number of pages from
    // the same count, so counting only the grouped rows would make the last rows unreachable.
    renderTable({ data: largeData });

    expect(screen.getByText('1-10 of 18')).toBeInTheDocument();
  });

  it('collapses a group from its repeated heading', () => {
    renderTable({ data: largeData, initialPage: 2 });

    fireEvent.click(screen.getByRole('button', { name: /team: blue \(12\)/ }));

    expect(bodyRowTexts()).not.toContain('blue-10');
  });

  it('selects only the visible rows from the select all checkbox', () => {
    renderTable({ data: data, enableRowSelection: true });

    fireEvent.click(screen.getByRole('button', { name: 'team: blue (2)' }));
    fireEvent.click(selectAllCheckbox());

    expect(selectAllCheckbox()).toBeChecked();
    expect(checkboxFor('bravo')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'team: blue (2)' }));

    expect(checkboxFor('charlie')).not.toBeChecked();
    expect(checkboxFor('alpha')).not.toBeChecked();
    expect(selectAllCheckbox()).not.toBeChecked();
    expect(selectAllCheckbox()).toHaveAttribute('data-indeterminate', 'true');
  });

  it('clears the visible rows from the select all checkbox while a group is collapsed', () => {
    renderTable({ data: data, enableRowSelection: true });

    fireEvent.click(screen.getByRole('button', { name: 'team: blue (2)' }));
    fireEvent.click(selectAllCheckbox());
    fireEvent.click(selectAllCheckbox());

    expect(checkboxFor('bravo')).not.toBeChecked();
    expect(selectAllCheckbox()).not.toBeChecked();
  });

  it('does not show select all as partly selected for rows in a collapsed group', () => {
    renderTable({ data: data, enableRowSelection: true });

    fireEvent.click(checkboxFor('bravo'));
    fireEvent.click(screen.getByRole('button', { name: 'team: red (1)' }));

    expect(selectAllCheckbox()).not.toBeChecked();
    expect(selectAllCheckbox()).toHaveAttribute('data-indeterminate', 'false');
  });

  it('does not show select all as partly selected for rows on another page', () => {
    renderTable({
      data: largeData,
      enableRowSelection: true,
      initialPage: 2,
      // blue-01, on the first page.
      initialState: { expanded: true, rowSelection: { '0': true } },
    });

    expect(selectAllCheckbox()).not.toBeChecked();
    expect(selectAllCheckbox()).toHaveAttribute('data-indeterminate', 'false');
  });

  it('updates select all when another row on screen becomes selectable', () => {
    // Like a cluster that finishes connecting while another one is already selected. Only
    // the table re-renders, as in the app: re-rendering the ThemeProvider would re-render
    // every head cell through the theme context and hide a stale memoized checkbox.
    const onlyBravo: TableProps<Item>['enableRowSelection'] = row => row.original.name === 'bravo';
    let setSelectable: (value: TableProps<Item>['enableRowSelection']) => void = () => {};
    function Harness() {
      const [enableRowSelection, setEnableRowSelection] = useState(() => onlyBravo);
      useEffect(() => {
        setSelectable = value => setEnableRowSelection(() => value);
      }, [setEnableRowSelection]);
      return (
        <Table
          columns={columns}
          data={data}
          enableGrouping
          enableRowSelection={enableRowSelection}
          initialState={{ expanded: true }}
          state={{ grouping: ['team'], columnVisibility: { team: false } }}
        />
      );
    }
    render(
      <ThemeProvider theme={theme}>
        <Harness />
      </ThemeProvider>
    );

    fireEvent.click(checkboxFor('bravo'));
    expect(selectAllCheckbox()).toBeChecked();

    act(() => setSelectable(() => true));

    expect(checkboxFor('alpha')).toBeEnabled();
    expect(selectAllCheckbox()).not.toBeChecked();
    expect(selectAllCheckbox()).toHaveAttribute('data-indeterminate', 'true');
  });

  it('only offers selection on the rows, not on group headings', () => {
    renderTable({ data: data, enableRowSelection: true });

    const headings = screen.getAllByRole('row').filter(row => row.querySelector('[aria-expanded]'));
    expect(headings).toHaveLength(2);
    headings.forEach(heading => expect(within(heading).queryByRole('checkbox')).toBeNull());
  });
});
