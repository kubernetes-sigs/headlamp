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

describe('Table toolbar and selection props', () => {
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

describe('Table select filter faceted values', () => {
  const statusRows = [
    { name: 'a', selected: false, status: 'Running' },
    { name: 'b', selected: false, status: 'Completed' },
    { name: 'c', selected: false, status: 'Running' },
    { name: 'd', selected: false, status: '' },
  ];

  const statusColumn = (filterVariant: string) =>
    ({
      id: 'status',
      header: 'Status',
      filterVariant,
      accessorFn: (row: any) => row.status,
    } as any);

  /**
   * Builds the minimal slice of a TanStack column that the custom
   * getFacetedUniqueValues implementation touches: the column definition and
   * a faceted row model whose rows resolve unique values through the column
   * accessor, like TanStack's own rows do.
   */
  function makeFacetedColumn(columnDef: any, rows: Record<string, any>[]) {
    const rowModel = {
      flatRows: rows.map(original => ({
        getUniqueValues: () => [columnDef.accessorFn(original)],
      })),
    };
    return { columnDef, getFacetedRowModel: () => rowModel, getIsFiltered: () => false };
  }

  /** Minimal TanStack table slice; the filter UI is visible unless stated otherwise. */
  function makeFacetedTable(
    column: any,
    { showColumnFilters = true, columnFilterDisplayMode = 'subheader' } = {}
  ) {
    return {
      getColumn: () => column,
      getState: () => ({ showColumnFilters }),
      options: { columnFilterDisplayMode },
    };
  }

  function facetedUniqueValues(
    columnId: string,
    rows: Record<string, any>[],
    tableState?: { showColumnFilters: boolean }
  ) {
    const columnDef = tableMocks.options.columns.find((column: any) => column.id === columnId);
    const table = makeFacetedTable(makeFacetedColumn(columnDef, rows), tableState);
    return tableMocks.options.getFacetedUniqueValues(table, columnId)();
  }

  it.each(['select', 'multi-select', 'autocomplete'])(
    'counts unique values for %s filter columns',
    filterVariant => {
      renderTable({ columns: [statusColumn(filterVariant)], data: statusRows as any });

      expect(Object.fromEntries(facetedUniqueValues('status', statusRows))).toEqual({
        Running: 2,
        Completed: 1,
        '': 1,
      });
    }
  );

  it.each([
    ['keeps the options of a column at the cap', 1000, 1000],
    ['drops the options of a column above the cap', 1001, 0],
  ])('%s', (_description: string, distinctValues: number, expectedSize: number) => {
    const rows = Array.from({ length: distinctValues }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    expect(facetedUniqueValues('status', rows).size).toBe(expectedSize);
  });

  it('stops walking the rows once a column is above the cap', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const accessorFn = vi.fn((row: any) => row.status);
    const columnDef = { ...tableMocks.options.columns[0], accessorFn };
    const table = makeFacetedTable(makeFacetedColumn(columnDef, rows));

    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().size).toBe(0);
    // Walking all 5000 rows is what the cap avoids.
    expect(accessorFn.mock.calls.length).toBeLessThanOrEqual(1001);
  });

  /**
   * Mimics what MRT does on every render: the row model stays, while TanStack builds a new
   * column object around a freshly spread column definition. Returns a function that renders
   * the column once more and reads its faceted values.
   */
  function renderableColumn(rows: Record<string, any>[]) {
    let columnDef: any;
    const rowModel = {
      flatRows: rows.map(original => ({ getUniqueValues: () => [columnDef.accessorFn(original)] })),
    };
    return (overrides: object = {}) => {
      columnDef = { ...tableMocks.options.columns[0], ...overrides };
      const column = {
        id: 'status',
        columnDef,
        getFacetedRowModel: () => rowModel,
        getIsFiltered: () => false,
      };
      return tableMocks.options.getFacetedUniqueValues(makeFacetedTable(column), 'status')();
    };
  }

  /**
   * Builds the column MRT hands to muiFilterTextFieldProps: the faceted slice above plus the
   * getFacetedUniqueValues closure TanStack installs on the column.
   */
  function makeFilterColumn(
    rows: Record<string, any>[],
    columnDef = tableMocks.options.columns[0]
  ) {
    const column: any = { id: 'status', ...makeFacetedColumn(columnDef, rows) };
    const table = makeFacetedTable(column);
    column.getFacetedUniqueValues = tableMocks.options.getFacetedUniqueValues(table, 'status');
    return { column, table };
  }

  /** Calls the filter text field props for a column, like MRT does while rendering it. */
  function filterTextFieldProps(rows: Record<string, any>[]) {
    const { column, table } = makeFilterColumn(rows);
    return tableMocks.options.muiFilterTextFieldProps({ column, table });
  }

  it('replaces the options of a capped column with a disabled notice', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const { children } = filterTextFieldProps(rows);

    expect(children.props.disabled).toBe(true);
    expect(children.props.children).toBe('Too many values to filter');
  });

  it('drops the notice when the column definition gains caller filter options', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    const props = () => tableMocks.options.muiFilterTextFieldProps({ column, table });

    expect(props().children.props.disabled).toBe(true);

    // Same column instance, definition swapped in place: the verdict must not survive.
    column.columnDef = { ...column.columnDef, filterSelectOptions: ['Custom'] };
    expect(props().children).toBeUndefined();

    column.columnDef = {
      ...column.columnDef,
      filterSelectOptions: undefined,
      filterVariant: 'text',
    };
    expect(props().children).toBeUndefined();
  });

  it('adds no notice when the caller replaces getFacetedUniqueValues', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({
      columns: [statusColumn('multi-select')],
      data: rows as any,
      getFacetedUniqueValues: (() => () => new Map()) as any,
    });

    const { column, table } = makeFilterColumn(rows);
    column.getFacetedUniqueValues = () => new Map();

    expect(tableMocks.options.muiFilterTextFieldProps({ column, table }).children).toBeUndefined();
  });

  it('adds no notice while a column stays below the cap', () => {
    renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

    expect(filterTextFieldProps(statusRows).children).toBeUndefined();
  });

  it.each([
    ['object', { placeholder: 'caller' }],
    ['function', () => ({ placeholder: 'caller' })],
  ])('keeps caller filter text field props in %s form', (_description, muiFilterTextFieldProps) => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({
      columns: [statusColumn('multi-select')],
      data: rows as any,
      muiFilterTextFieldProps: muiFilterTextFieldProps as any,
    });

    const props = filterTextFieldProps(rows);

    expect(props.placeholder).toBe('caller');
    expect(props.children.props.disabled).toBe(true);
  });

  it('skips the computation when the caller provides filter options', () => {
    const accessorFn = vi.fn((row: any) => row.status);
    renderTable({
      columns: [{ ...statusColumn('multi-select'), filterSelectOptions: ['Running'] }],
      data: statusRows as any,
    });

    const columnDef = { ...tableMocks.options.columns[0], accessorFn };
    const table = makeFacetedTable(makeFacetedColumn(columnDef, statusRows));

    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().size).toBe(0);
    expect(accessorFn).not.toHaveBeenCalled();
  });

  it('walks a row model once, even though MRT rebuilds its columns every render', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const accessorFn = vi.fn((row: any) => row.status);
    const readAgain = renderableColumn(rows);

    readAgain({ accessorFn });
    const callsAfterFirstRender = accessorFn.mock.calls.length;
    readAgain({ accessorFn });

    expect(callsAfterFirstRender).toBe(rows.length);
    expect(accessorFn.mock.calls.length).toBe(callsAfterFirstRender);
  });

  it('serves the cached values regardless of column identity churn', () => {
    // TanStack freezes row.getUniqueValues per row and column for the row model's lifetime,
    // so recomputing on a column-definition change could not observe anything new anyway.
    const rows = [{ status: 'Running' }, { status: 'Done' }];
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });
    const readAgain = renderableColumn(rows);

    const first = readAgain({ accessorFn: (row: any) => row.status });
    const second = readAgain({ accessorFn: (row: any) => `${row.status}!` });

    expect([...first.keys()]).toEqual(['Running', 'Done']);
    expect(second).toBe(first);
  });

  it('leaves the menu and the helper text to a caller that provides them', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));

    renderTable({
      columns: [statusColumn('multi-select')],
      data: rows as any,
      muiFilterTextFieldProps: { children: 'mine' } as any,
    });
    expect(filterTextFieldProps(rows).children).toBe('mine');

    renderTable({
      columns: [statusColumn('autocomplete')],
      data: rows as any,
      muiFilterTextFieldProps: { helperText: 'mine' } as any,
    });
    expect(filterTextFieldProps(rows).helperText).toBe('mine');
  });

  it('counts only the values MRT would offer against the cap', () => {
    // MAX_FILTER_OPTIONS worth of real values plus rows the accessor leaves empty.
    const rows = [
      ...Array.from({ length: 1000 }, (_, index) => ({ status: `s${index}` })),
      { status: null },
      { status: undefined },
    ];
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    expect(facetedUniqueValues('status', rows).size).toBe(1000);
    expect(filterTextFieldProps(rows).children).toBeUndefined();
  });

  it.each([
    ['keeps', 'the filter mode label', { enableColumnFilterModes: true }, {}, undefined],
    // MRT reads the table-level flag, a column can only opt out of it.
    [
      'adds',
      'the hint when only the column asks for modes',
      {},
      { enableColumnFilterModes: true },
      'Too many values to filter',
    ],
    [
      'adds',
      'the hint when the column opts out of modes',
      { enableColumnFilterModes: true },
      { enableColumnFilterModes: false },
      'Too many values to filter',
    ],
    // MRT renders no mode button, and no label, without options to switch between.
    [
      'adds',
      'the hint when no filter mode is left to pick',
      { enableColumnFilterModes: true, columnFilterModeOptions: [] },
      {},
      'Too many values to filter',
    ],
  ])(
    '%s %s on a capped autocomplete column',
    (_verb, _case, tableSettings: object, columnSettings: object, expected) => {
      const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
      renderTable({
        columns: [{ ...statusColumn('autocomplete'), ...columnSettings }],
        data: rows as any,
        ...tableSettings,
      });

      expect(filterTextFieldProps(rows).helperText).toBe(expected);
    }
  );

  it('serves no values for a column MRT cannot sort', () => {
    const rows = [{ status: 1 }, { status: 2 }];
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    // MRT sorts the options with localeCompare, so non-strings would throw on render.
    expect(facetedUniqueValues('status', rows).size).toBe(0);
    expect(filterTextFieldProps(rows).children).toBeUndefined();
  });

  it.each([
    ['faceting is on', { enableFacetedValues: true }],
    ['the caller brings its own', { getFacetedUniqueValues: (() => () => new Map()) as any }],
  ])('leaves getFacetedUniqueValues alone when %s', (_description, props) => {
    renderTable({
      columns: [statusColumn('multi-select')],
      data: statusRows as any,
      ...props,
    });

    // MRT applies caller options over its own wiring, so ours must not be set at all here.
    expect(tableMocks.options.getFacetedUniqueValues).toBe((props as any).getFacetedUniqueValues);
  });

  it('returns an empty map for columns without a dropdown filter', () => {
    renderTable({
      columns: [{ id: 'name', header: 'Name', accessorFn: (row: any) => row.name }],
      data: statusRows as any,
    });

    expect(facetedUniqueValues('name', statusRows).size).toBe(0);
  });

  it('recomputes only when the faceted rows change', () => {
    renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

    const columnDef = tableMocks.options.columns[0];
    let column = makeFacetedColumn(columnDef, statusRows);
    const getValues = tableMocks.options.getFacetedUniqueValues(
      {
        getColumn: () => column,
        getState: () => ({ showColumnFilters: true }),
        options: {},
      },
      'status'
    );

    const first = getValues();
    expect(getValues()).toBe(first);

    column = makeFacetedColumn(columnDef, [{ status: 'Failed' }]);
    expect(Object.fromEntries(getValues())).toEqual({ Failed: 1 });
  });

  it('does not walk the rows while the filter UI is hidden and no filter is active', () => {
    renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

    const values = facetedUniqueValues('status', statusRows, { showColumnFilters: false });

    expect(values.size).toBe(0);
  });

  it.each(['popover', 'custom'])(
    'computes the options in %s mode, where the filter UI is not tied to showColumnFilters',
    columnFilterDisplayMode => {
      renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

      const columnDef = tableMocks.options.columns[0];
      const table = makeFacetedTable(makeFacetedColumn(columnDef, statusRows), {
        showColumnFilters: false,
        columnFilterDisplayMode,
      });

      expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().size).toBe(3);
    }
  );

  it('computes the options for an active filter even while the filter UI is hidden', () => {
    renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

    const columnDef = tableMocks.options.columns[0];
    const column = { ...makeFacetedColumn(columnDef, statusRows), getIsFiltered: () => true };
    const table = makeFacetedTable(column, { showColumnFilters: false });

    const values = tableMocks.options.getFacetedUniqueValues(table, 'status')();

    expect(Object.fromEntries(values)).toEqual({ Running: 2, Completed: 1, '': 1 });
  });

  it('keeps a caller-provided getFacetedUniqueValues implementation', () => {
    const custom = vi.fn();
    renderTable({ getFacetedUniqueValues: custom as any });

    expect(tableMocks.options.getFacetedUniqueValues).toBe(custom);
  });

  it('passes caller filter options through to the columns untouched', () => {
    renderTable({
      columns: [{ ...statusColumn('multi-select'), filterSelectOptions: ['Custom'] }],
      data: statusRows as any,
    });

    expect(tableMocks.options.columns[0].filterSelectOptions).toEqual(['Custom']);
  });

  it('leaves filterSelectOptions to MRT instead of injecting them into columns', () => {
    renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

    expect(tableMocks.options.columns[0].filterSelectOptions).toBeUndefined();
  });
});
