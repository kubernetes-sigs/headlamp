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

import { ThemeProvider } from '@mui/material/styles';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import Table, { TableProps } from './Table';

const { tableMocks } = vi.hoisted(() => ({
  tableMocks: {
    cellContext: 'plain' as 'dialog' | 'plain' | 'switch',
    columnVisibility: {} as Record<string, boolean>,
    forceNoRows: false,
    options: null as any,
    setColumnVisibility: vi.fn(),
    setRowSelection: vi.fn(),
    setTablesRowsPerPage: vi.fn(),
    setURLState: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('../../../lib/useShortcut', () => ({ useShortcut: vi.fn() }));
vi.mock('../../../lib/util', () => ({
  useURLState: (_key: string, options: { defaultValue: number }) => [
    options.defaultValue,
    tableMocks.setURLState,
  ],
}));
vi.mock('../../../helpers/tablesRowsPerPage', () => ({
  getTablesRowsPerPage: () => 10,
  setTablesRowsPerPage: tableMocks.setTablesRowsPerPage,
}));
vi.mock('../../App/Settings/hook', () => ({ useSettings: () => [10] }));
vi.mock('../../resourceMap/useQueryParamsState', () => ({
  useQueryParamsState: (_key: string, initialValue: unknown) => [initialValue, vi.fn()],
}));
vi.mock('./ColumnVisibilityButton', () => ({
  ColumnVisibilityButton: () => <button data-testid="column-visibility" />,
}));
vi.mock('./useScrollPreservation', () => ({
  useScrollPreservationOnDataChange: () => ({ ref: { current: null }, onScroll: vi.fn() }),
}));

vi.mock('material-react-table', () => ({
  MRT_BottomToolbar: () => <div data-testid="bottom-toolbar" />,
  MRT_TableBodyCell: ({ cell }: any) => {
    const checkbox = <input aria-label={`Custom selection for ${cell.row.id}`} type="checkbox" />;
    return (
      <td>
        {tableMocks.cellContext === 'switch' ? (
          <span className="MuiSwitch-root">{checkbox}</span>
        ) : tableMocks.cellContext === 'dialog' ? (
          <span role="dialog">{checkbox}</span>
        ) : (
          checkbox
        )}
      </td>
    );
  },
  MRT_TableHeadCell: () => <th>Selection</th>,
  MRT_ToggleDensePaddingButton: () => <button data-testid="density-toggle" />,
  MRT_ToggleFiltersButton: () => <button data-testid="filters-toggle" />,
  MRT_ToggleFullScreenButton: () => <button data-testid="fullscreen-toggle" />,
  MRT_ToggleGlobalFilterButton: () => <button data-testid="search-toggle" />,
  MRT_TopToolbar: () => <div data-testid="top-toolbar" />,
  useMaterialReactTable: (options: any) => {
    tableMocks.options = options;
    const rows = options.data.map((item: Record<string, unknown>, index: number) => {
      const row: any = {
        id: String(index),
        getCanSelect: () => true,
        getIsSelected: () => false,
      };
      row.getVisibleCells = () => [
        {
          id: `${row.id}-selection`,
          column: { id: 'selection', columnDef: options.columns[0] },
          getValue: () => item.selected,
          row,
        },
      ];
      return row;
    });

    return {
      getHeaderGroups: () => [
        {
          headers: [
            {
              id: 'selection',
              column: {
                id: 'selection',
                getFilterValue: () => undefined,
                getIsFiltered: () => false,
                getIsSorted: () => false,
              },
            },
          ],
        },
      ],
      getRowModel: () => ({ rows }),
      getSelectedRowModel: () => ({ flatRows: [], rows: [] }),
      getState: () => ({
        columnVisibility: tableMocks.columnVisibility,
        showColumnFilters: false,
      }),
      rows,
      setColumnVisibility: tableMocks.setColumnVisibility,
      setRowSelection: tableMocks.setRowSelection,
      setShowColumnFilters: vi.fn(),
    };
  },
  useMRT_Rows: (table: any) => (tableMocks.forceNoRows ? [] : table.rows),
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

interface TestRow {
  /** Optional name used by additional data columns. */
  name?: string;
  /** Value rendered by the custom selection column. */
  selected: boolean;
}

/**
 * Renders a one-row table with optional toolbar and row-selection settings.
 *
 * @param props - Table behavior settings to exercise.
 * @returns The Testing Library render result.
 */
function renderTable(props: Partial<TableProps<TestRow>> = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <Table
        columns={[{ accessorKey: 'selected', header: 'Selection' }]}
        data={[{ selected: false }]}
        {...props}
      />
    </ThemeProvider>
  );
}

function toolbarTable(selectedRows: object[] = []) {
  return {
    getSelectedRowModel: () => ({ rows: selectedRows }),
    options: tableMocks.options,
  };
}

describe('Table toolbar and selection props', () => {
  beforeEach(() => {
    tableMocks.cellContext = 'plain';
    tableMocks.columnVisibility = {};
    tableMocks.forceNoRows = false;
    tableMocks.options = null;
    tableMocks.setColumnVisibility.mockClear();
    tableMocks.setRowSelection.mockClear();
    tableMocks.setTablesRowsPerPage.mockClear();
    tableMocks.setURLState.mockClear();
  });

  it.each([
    ['by default', {}],
    ['when enabled', { enableTopToolbar: true }],
  ])('shows the top toolbar %s', (_description: string, props: object) => {
    renderTable(props);

    expect(screen.getByTestId('top-toolbar')).toBeVisible();
  });

  it('hides the top toolbar when disabled', () => {
    renderTable({ enableTopToolbar: false });

    expect(screen.queryByTestId('top-toolbar')).not.toBeInTheDocument();
  });

  it.each([
    ['when omitted', {}],
    ['when enabled', { enableRowSelection: true }],
  ])('handles custom selection checkboxes %s', (_description: string, props: object) => {
    renderTable(props);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(tableMocks.setRowSelection).toHaveBeenCalledOnce();
  });

  it('ignores custom selection checkboxes when row selection is disabled', () => {
    renderTable({ enableRowSelection: false });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(tableMocks.setRowSelection).not.toHaveBeenCalled();
  });

  it.each(['switch', 'dialog'] as const)('ignores checkboxes inside a %s', context => {
    tableMocks.cellContext = context;
    renderTable({ enableRowSelection: true });

    fireEvent.click(screen.getByRole('checkbox'));

    expect(tableMocks.setRowSelection).not.toHaveBeenCalled();
  });

  it('ignores clicks outside checkboxes', () => {
    renderTable({ enableRowSelection: true });

    fireEvent.click(screen.getByRole('cell'));

    expect(tableMocks.setRowSelection).not.toHaveBeenCalled();
  });

  it('selects a range when a checkbox is shift-clicked', () => {
    renderTable({
      data: [{ selected: false }, { selected: false }],
      enableRowSelection: true,
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1], { shiftKey: true });

    expect(tableMocks.setRowSelection).toHaveBeenCalledTimes(2);
  });
});

describe('Table states and options', () => {
  beforeEach(() => {
    tableMocks.cellContext = 'plain';
    tableMocks.columnVisibility = {};
    tableMocks.forceNoRows = false;
    tableMocks.options = null;
    tableMocks.setColumnVisibility.mockClear();
    tableMocks.setRowSelection.mockClear();
    tableMocks.setTablesRowsPerPage.mockClear();
    tableMocks.setURLState.mockClear();
  });

  it('renders error, loading, and empty states', () => {
    const errorResult = renderTable({ errorMessage: 'Unable to load rows' });
    expect(screen.getByText('Unable to load rows')).toBeVisible();
    errorResult.unmount();

    const loadingResult = renderTable({ loading: true });
    expect(screen.getByRole('progressbar', { name: 'Loading table data' })).toBeVisible();
    loadingResult.unmount();

    renderTable({ data: [], emptyMessage: 'Nothing here' });
    expect(screen.getByRole('status')).toHaveTextContent('Nothing here');
  });

  it('filters data before passing it to Material React Table', () => {
    renderTable({
      data: [
        { name: 'keep', selected: false },
        { name: 'remove', selected: false },
      ],
      filterFunction: row => row.name === 'keep',
    });

    expect(tableMocks.options.data).toEqual([{ name: 'keep', selected: false }]);
  });

  it('uses caller pagination, ordering, and initial filter options', () => {
    renderTable({
      columns: [
        { accessorKey: 'selected', gridTemplate: 2, header: 'Selection' },
        { accessorKey: 'name', gridTemplate: 'min-content', header: 'Name' },
      ],
      data: [
        { name: 'first', selected: false },
        { name: 'second', selected: false },
      ],
      enableRowActions: true,
      enableRowSelection: true,
      initialState: { globalFilter: 'first' },
      reflectInURL: true,
      rowsPerPage: [1, 2],
    });

    expect(tableMocks.options.enablePagination).toBe(true);
    expect(tableMocks.options.initialState.globalFilter).toBe('first');
    expect(tableMocks.options.state.columnOrder).toEqual([
      'mrt-row-select',
      '0',
      '1',
      'mrt-row-actions',
    ]);
    expect(tableMocks.options.state.showGlobalFilter).toBe(true);
  });

  it('renders a caller selection toolbar only when rows are selected', () => {
    const renderRowSelectionToolbar = vi.fn(() => <span>Selected actions</span>);
    renderTable({ enableRowSelection: true, renderRowSelectionToolbar });

    const noSelection = tableMocks.options.renderToolbarInternalActions({
      table: toolbarTable(),
    });
    const withSelection = tableMocks.options.renderToolbarInternalActions({
      table: toolbarTable([{}]),
    });

    expect(noSelection).not.toBeNull();
    expect(withSelection).toEqual(<span>Selected actions</span>);
    expect(renderRowSelectionToolbar).toHaveBeenCalledOnce();
  });

  it('renders internal controls when selected rows have no custom toolbar', () => {
    renderTable({ enableRowSelection: true });

    const toolbar = tableMocks.options.renderToolbarInternalActions({
      table: toolbarTable([{}]),
    });

    render(<ThemeProvider theme={theme}>{toolbar}</ThemeProvider>);

    expect(screen.getByTestId('search-toggle')).toBeVisible();
    expect(screen.getByTestId('filters-toggle')).toBeVisible();
    expect(screen.getByTestId('column-visibility')).toBeVisible();
  });

  it('renders every enabled internal toolbar control', () => {
    renderTable({ enableDensityToggle: true, enableFullScreenToggle: true });

    const toolbar = tableMocks.options.renderToolbarInternalActions({
      table: toolbarTable(),
    });
    render(<ThemeProvider theme={theme}>{toolbar}</ThemeProvider>);

    expect(screen.getByTestId('search-toggle')).toBeVisible();
    expect(screen.getByTestId('filters-toggle')).toBeVisible();
    expect(screen.getByTestId('column-visibility')).toBeVisible();
    expect(screen.getByTestId('density-toggle')).toBeVisible();
    expect(screen.getByTestId('fullscreen-toggle')).toBeVisible();
  });

  it('provides an empty-results fallback to Material React Table', () => {
    renderTable();

    const fallback = tableMocks.options.renderEmptyRowsFallback();
    const result = render(<ThemeProvider theme={theme}>{fallback}</ThemeProvider>);

    expect(result.getByText('No results found')).toBeVisible();
  });

  it('announces when filtering leaves no rows', () => {
    tableMocks.forceNoRows = true;
    renderTable();

    expect(screen.getByRole('status')).toHaveTextContent('No results found');
  });

  it('updates pagination and stores a changed page size', async () => {
    renderTable();

    act(() => {
      tableMocks.options.onPaginationChange(() => ({ pageIndex: 2, pageSize: 25 }));
    });

    await waitFor(() => expect(tableMocks.setURLState).toHaveBeenCalledWith(4));
    expect(tableMocks.setURLState).toHaveBeenCalledWith(25);
    expect(tableMocks.setTablesRowsPerPage).toHaveBeenCalledWith(25);
  });

  it('skips pagination updates when there are no rows', () => {
    const updater = vi.fn();
    renderTable({ data: [] });

    tableMocks.options.onPaginationChange(updater);

    expect(updater).not.toHaveBeenCalled();
  });

  it('hides lower-priority columns when the container is narrow', () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(150);

    renderTable({
      columns: [
        { accessorKey: 'selected', header: 'Selection', responsivePriority: 10 },
        { accessorKey: 'name', header: 'Name', responsivePriority: 1 },
        { accessorKey: 'detail', header: 'Detail', responsivePriority: 1 },
        { accessorKey: 'status', header: 'Status', responsivePriority: 2 },
      ],
      enableRowActions: true,
      enableRowSelection: true,
      state: { columnVisibility: { detail: false } },
    });

    expect(tableMocks.options.state.columnVisibility).toMatchObject({
      '1': false,
      '2': false,
      '3': false,
      detail: false,
    });

    clientWidth.mockRestore();
  });

  it('keeps columns visible when the container is wide enough', () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);

    renderTable({
      columns: [
        { accessorKey: 'selected', header: 'Selection' },
        { accessorKey: 'name', header: 'Name' },
      ],
    });

    expect(tableMocks.options.state.columnVisibility).toEqual({});

    clientWidth.mockRestore();
  });

  it('hides and restores the actions column with data-column visibility', () => {
    tableMocks.columnVisibility = { '0': false };
    const hiddenResult = renderTable({
      columns: [{ accessorKey: 'selected', header: 'Selection' }],
    });

    expect(tableMocks.setColumnVisibility).toHaveBeenCalledOnce();
    hiddenResult.unmount();

    tableMocks.setColumnVisibility.mockClear();
    tableMocks.columnVisibility = { '0': true, actions: false };
    renderTable({ columns: [{ accessorKey: 'selected', header: 'Selection' }] });

    expect(tableMocks.setColumnVisibility).toHaveBeenCalledOnce();
  });
});
