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
import { MRT_VisibilityState } from 'material-react-table';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../../lib/themes';
import Table, { TableProps } from './Table';

const { tableMocks } = vi.hoisted(() => ({
  tableMocks: {
    bodyCellRenders: 0,
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
  useTranslation: () => ({
    // Keys stand in for their translation, with the interpolation i18next would do.
    t: (key: string, values?: Record<string, unknown>) =>
      key.replace(/{{(\w+)}}/g, (_match, name) => String(values?.[name])),
    i18n: { language: 'en' },
  }),
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
    tableMocks.bodyCellRenders++;
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
        original: item,
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
      options,
      getHeaderGroups: () => [
        {
          headers: [
            {
              id: 'selection',
              column: {
                id: 'selection',
                columnDef: options.columns[0],
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
        ...options.state,
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

describe('empty bottom toolbar spacing', () => {
  it('preserves caller toolbar spacing and retains native defaults otherwise', () => {
    const toolbar = { sx: { mb: 2, height: '3.5rem' } };
    const { unmount } = renderTable({ muiTopToolbarProps: toolbar });
    expect(tableMocks.options.muiTopToolbarProps).toBe(toolbar);
    unmount();
    renderTable();
    expect(tableMocks.options.muiTopToolbarProps.sx.height).toBe('3.5rem');
  });

  it('preserves the toolbar by default', () => {
    renderTable();
    expect(screen.getByTestId('bottom-toolbar')).toBeTruthy();
  });

  it('collapses an empty toolbar only when opted in', () => {
    renderTable({ hideEmptyBottomToolbar: true });
    expect(screen.queryByTestId('bottom-toolbar')).toBeNull();
  });

  it('retains pagination for larger lists', () => {
    renderTable({
      hideEmptyBottomToolbar: true,
      data: Array.from({ length: 11 }, () => ({ selected: false })),
    });
    expect(screen.getByTestId('bottom-toolbar')).toBeTruthy();
  });

  it.each([
    { isLoading: true },
    { isSaving: true },
    { showProgressBars: true },
    { showAlertBanner: true },
    { showToolbarDropZone: true },
    { grouping: ['selected'] },
    { rowSelection: { '0': true } },
  ])('retains footer status for %j', state => {
    renderTable({ hideEmptyBottomToolbar: true, state });
    expect(screen.getByTestId('bottom-toolbar')).toBeTruthy();
  });

  it('retains custom footer actions', () => {
    renderTable({
      hideEmptyBottomToolbar: true,
      renderBottomToolbarCustomActions: () => <button>Footer action</button>,
    });
    expect(screen.getByTestId('bottom-toolbar')).toBeTruthy();
  });
});

function toolbarTable(selectedRows: object[] = []) {
  return {
    getSelectedRowModel: () => ({ rows: selectedRows }),
    options: tableMocks.options,
  };
}

beforeEach(() => {
  tableMocks.bodyCellRenders = 0;
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

  it('forwards visibility changes so a caller can save and restore its columns', () => {
    const onColumnVisibilityChange = vi.fn();
    renderTable({ state: { columnVisibility: { detail: false } }, onColumnVisibilityChange });
    tableMocks.options.onColumnVisibilityChange({ detail: true });
    expect(onColumnVisibilityChange).toHaveBeenCalledWith({ detail: true });
    expect(tableMocks.options.state.columnVisibility.detail).toBe(false);
  });

  it('treats equal keys in a complete controlled update as explicit assignments', () => {
    const onColumnVisibilityChange = vi.fn();
    renderTable({
      state: { columnVisibility: { detail: false } },
      onColumnVisibilityChange,
    });

    act(() => tableMocks.options.onColumnVisibilityChange({ detail: false }));

    expect(onColumnVisibilityChange).toHaveBeenCalledWith({ detail: false });
  });

  it('lets local visibility toggles override caller defaults without a change callback', () => {
    renderTable({ state: { columnVisibility: { cluster: true } } });
    expect(tableMocks.options.state.columnVisibility.cluster).toBe(true);

    act(() => tableMocks.options.onColumnVisibilityChange({ cluster: false }));
    expect(tableMocks.options.state.columnVisibility.cluster).toBe(false);

    act(() => {
      tableMocks.options.onColumnVisibilityChange((previous: Record<string, boolean>) => ({
        ...previous,
        cluster: true,
      }));
    });
    expect(tableMocks.options.state.columnVisibility.cluster).toBe(true);
  });

  it('treats keys omitted by a visibility reset as visible', () => {
    renderTable({ state: { columnVisibility: { detail: false } } });

    act(() => tableMocks.options.onColumnVisibilityChange(() => ({})));

    expect(tableMocks.options.state.columnVisibility.detail).toBe(true);
  });

  it('waits for controlled caller acceptance before applying a visibility choice', () => {
    const onColumnVisibilityChange = vi.fn();
    const props = {
      columns: [{ id: 'detail', accessorKey: 'selected', header: 'Detail' }],
      data: [{ selected: false }],
      onColumnVisibilityChange,
      state: { columnVisibility: { detail: true } },
    };
    const { rerender } = renderTable(props);

    act(() =>
      tableMocks.options.onColumnVisibilityChange((previous: Record<string, boolean>) => ({
        ...previous,
        detail: false,
      }))
    );
    expect(tableMocks.options.state.columnVisibility.detail).toBe(true);

    rerender(
      <ThemeProvider theme={theme}>
        <Table {...props} state={{ columnVisibility: { detail: true } }} />
      </ThemeProvider>
    );

    expect(tableMocks.options.state.columnVisibility.detail).toBe(true);
  });

  it('evaluates consecutive functional visibility updates from queued state', () => {
    const callbacks: Array<
      MRT_VisibilityState | ((old: MRT_VisibilityState) => MRT_VisibilityState)
    > = [];
    renderTable({
      state: { columnVisibility: {} },
      onColumnVisibilityChange: updater => callbacks.push(updater),
    });

    act(() => {
      tableMocks.options.onColumnVisibilityChange((old: Record<string, boolean>) => ({
        ...old,
        selected: false,
      }));
      tableMocks.options.onColumnVisibilityChange((old: Record<string, boolean>) => ({
        ...old,
        name: false,
      }));
    });

    const accepted = callbacks.reduce<MRT_VisibilityState>(
      (state, updater) => (typeof updater === 'function' ? updater(state) : updater),
      {} as MRT_VisibilityState
    );
    expect(accepted).toMatchObject({ selected: false, name: false });
  });

  it('toggles a column twice in one event back to where it was', () => {
    const callbacks: Array<
      MRT_VisibilityState | ((old: MRT_VisibilityState) => MRT_VisibilityState)
    > = [];
    renderTable({
      state: { columnVisibility: { detail: true } },
      onColumnVisibilityChange: updater => callbacks.push(updater),
    });

    act(() => {
      const toggle = (old: MRT_VisibilityState) => ({ ...old, detail: old.detail === false });
      tableMocks.options.onColumnVisibilityChange(toggle);
      tableMocks.options.onColumnVisibilityChange(toggle);
    });

    const accepted = callbacks.reduce<MRT_VisibilityState>(
      (state, updater) => (typeof updater === 'function' ? updater(state) : updater),
      { detail: true }
    );
    expect(accepted.detail).toBe(true);
  });

  it('keeps the caller action columns in a complete controlled update', () => {
    const onColumnVisibilityChange = vi.fn();
    renderTable({
      enableRowActions: true,
      state: { columnVisibility: { 'mrt-row-actions': false } },
      onColumnVisibilityChange,
    });

    act(() => tableMocks.options.onColumnVisibilityChange({ detail: false }));

    expect(onColumnVisibilityChange).toHaveBeenCalledWith({
      'mrt-row-actions': false,
      detail: false,
    });
  });

  it('forwards a controlled reset of all visibility keys as visible', () => {
    const onColumnVisibilityChange = vi.fn();
    renderTable({
      state: { columnVisibility: { detail: false } },
      onColumnVisibilityChange,
    });

    act(() => tableMocks.options.onColumnVisibilityChange(() => ({})));

    const updater = onColumnVisibilityChange.mock.calls.at(-1)![0];
    expect(updater({ detail: false })).toEqual({ '0': true, detail: true });
  });

  it('uses updated caller visibility over initial visibility with a change callback', () => {
    const onColumnVisibilityChange = vi.fn();
    const props = {
      columns: [{ accessorKey: 'selected', header: 'Selection' }],
      data: [{ selected: false }],
      initialState: { columnVisibility: { detail: true } },
      onColumnVisibilityChange,
    };
    const { rerender } = renderTable({
      ...props,
      state: { columnVisibility: { detail: false } },
    });
    expect(tableMocks.options.state.columnVisibility.detail).toBe(false);

    rerender(
      <ThemeProvider theme={theme}>
        <Table {...props} state={{ columnVisibility: { detail: true } }} />
      </ThemeProvider>
    );
    expect(tableMocks.options.state.columnVisibility.detail).toBe(true);
  });

  it('treats caller visibility as the complete map with a change callback', () => {
    const props = {
      columns: [{ accessorKey: 'selected', header: 'Selection' }],
      data: [{ selected: false }],
      initialState: { columnVisibility: { detail: false } },
      onColumnVisibilityChange: vi.fn(),
    };
    const { rerender } = renderTable({
      ...props,
      state: { columnVisibility: { detail: false } },
    });
    expect(tableMocks.options.state.columnVisibility).toEqual({ detail: false });

    rerender(
      <ThemeProvider theme={theme}>
        <Table {...props} state={{ columnVisibility: {} }} />
      </ThemeProvider>
    );
    expect(tableMocks.options.state.columnVisibility).toEqual({});

    rerender(
      <ThemeProvider theme={theme}>
        <Table {...props} />
      </ThemeProvider>
    );
    expect(tableMocks.options.state.columnVisibility).toEqual({ detail: false });
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

describe('Table cell memoization', () => {
  it('re-renders cells when their row changes but not when only the renderer is rebuilt', () => {
    const row = { selected: false };
    // Callers such as resource lists pass inline columns, rebuilding renderers on every render.
    const renderWith = (data: TestRow[]) => (
      <ThemeProvider theme={theme}>
        <Table
          columns={[{ accessorKey: 'selected', header: 'Selection', Cell: () => null }]}
          data={data}
        />
      </ThemeProvider>
    );
    const { rerender } = render(renderWith([row]));
    const renders = tableMocks.bodyCellRenders;

    rerender(renderWith([row]));
    expect(tableMocks.bodyCellRenders).toBe(renders);

    rerender(renderWith([{ ...row }]));
    expect(tableMocks.bodyCellRenders).toBe(renders + 1);
  });
});

describe('Table responsive visibility and horizontal scrolling', () => {
  const columns = [
    { id: 'selection', accessorKey: 'selected', header: 'Selection' },
    { id: 'name', accessorKey: 'name', header: 'Name' },
    { id: 'detail', accessorKey: 'detail', header: 'Detail' },
  ];
  let resize: (width: number) => void;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(150);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = width => callback([{ contentRect: { width } } as ResizeObserverEntry], this);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps normal responsive hiding and the existing table structure', () => {
    renderTable({ columns });
    expect(tableMocks.options.state.columnVisibility).toEqual({ name: false, detail: false });
    const table = screen.getByRole('table');
    expect(table).not.toHaveAttribute('tabindex');
    expect(getComputedStyle(table).gridTemplateColumns).toBe('1fr');
    expect(screen.getByTestId('top-toolbar').parentElement).toBe(table.parentElement);
    expect(screen.getByTestId('bottom-toolbar').parentElement).toBe(table.parentElement);
  });

  it('preserves a local show/hide choice while resizing without remounting or losing focus', () => {
    renderTable({ columns });
    const table = screen.getByRole('table');
    const checkbox = screen.getByRole('checkbox');
    checkbox.focus();
    act(() => tableMocks.options.onColumnVisibilityChange({ name: true, detail: false }));
    expect(tableMocks.options.state.columnVisibility).toEqual({ name: true, detail: false });
    expect(table).toHaveAttribute('tabindex', '0');
    expect(getComputedStyle(table).gridTemplateColumns).toBe(
      'minmax(100px, 1fr) minmax(100px, 1fr)'
    );
    expect(checkbox).toHaveFocus();

    act(() => resize(600));
    expect(tableMocks.options.state.columnVisibility).toEqual({ name: true, detail: false });
    expect(table).not.toHaveAttribute('tabindex');
    expect(getComputedStyle(table).gridTemplateColumns).toBe('1fr 1fr');
    act(() => resize(150));
    expect(screen.getByRole('table')).toBe(table);
    expect(screen.getByRole('checkbox')).toBe(checkbox);
    expect(checkbox).toHaveFocus();

    act(() => tableMocks.options.onColumnVisibilityChange({ name: false, detail: false }));
    expect(tableMocks.options.state.columnVisibility.name).toBe(false);
    expect(table).not.toHaveAttribute('tabindex');
    act(() => resize(600));
    expect(tableMocks.options.state.columnVisibility.name).toBe(false);
  });

  it('honors initial visibility and excludes hidden columns from the width budget', () => {
    const columnVisibility = { selection: false, name: false, detail: true };
    renderTable({ columns, initialState: { columnVisibility } });
    expect(tableMocks.options.state.columnVisibility).toEqual(columnVisibility);
    expect(screen.getByRole('table')).not.toHaveAttribute('tabindex');
  });

  it('keeps the Node column after the user explicitly shows it', () => {
    renderTable({
      columns: [
        { id: 'selection', accessorKey: 'selected', header: 'Selection' },
        { id: 'status', accessorKey: 'status', header: 'Status' },
        { id: 'node', accessorKey: 'node', header: 'Node' },
        { id: 'ip', accessorKey: 'ip', header: 'IP' },
      ],
    });

    act(() =>
      tableMocks.options.onColumnVisibilityChange({
        status: false,
        node: true,
        ip: false,
      })
    );

    expect(tableMocks.options.state.columnVisibility).toMatchObject({
      status: false,
      node: true,
      ip: false,
    });
    expect(screen.getByRole('table')).toHaveAttribute('tabindex', '0');
  });

  it('keeps caller control authoritative, including a replacement empty map', () => {
    const onColumnVisibilityChange = vi.fn();
    const props = { columns, data: [{ selected: false }], onColumnVisibilityChange };
    const { rerender } = renderTable({ ...props, state: { columnVisibility: { name: true } } });
    expect(tableMocks.options.state.columnVisibility.name).toBe(true);
    act(() => tableMocks.options.onColumnVisibilityChange({ name: false }));
    expect(onColumnVisibilityChange).toHaveBeenCalledWith({ name: false });
    expect(tableMocks.options.state.columnVisibility.name).toBe(true);
    rerender(
      <ThemeProvider theme={theme}>
        <Table {...props} state={{ columnVisibility: {} }} />
      </ThemeProvider>
    );
    expect(tableMocks.options.state.columnVisibility).toEqual({ name: false, detail: false });
    expect(screen.getByRole('table')).not.toHaveAttribute('tabindex');
  });

  it.each([
    [undefined, 'minmax(100px, 1fr)'],
    [2, 'minmax(100px, 2fr)'],
    ['1.5fr', 'minmax(100px, 1.5fr)'],
    ['auto', 'minmax(100px, auto)'],
    ['min-content', 'minmax(100px, min-content)'],
    ['minmax(120px, 2fr)', 'minmax(120px, 2fr)'],
  ])(
    'provides real minimum tracks for %s without replacing explicit CSS sizing',
    (gridTemplate, expected) => {
      renderTable({
        columns: columns.slice(0, 2).map(column => ({ ...column, gridTemplate })),
        enableRowActions: true,
        enableRowSelection: true,
      });
      act(() => tableMocks.options.onColumnVisibilityChange({ selection: true, name: true }));
      const table = screen.getByRole('table');
      expect(table).toHaveAttribute('tabindex', '0');
      expect(getComputedStyle(table).overflowX).toBe('auto');
      expect(getComputedStyle(table).gridTemplateColumns).toBe(
        `44px ${expected} ${expected} minmax(52px, 0.05fr)`
      );
      expect(table).not.toContainElement(screen.getByTestId('top-toolbar'));
      expect(table).not.toContainElement(screen.getByTestId('bottom-toolbar'));
      table.focus();
      expect(table).toHaveFocus();
    }
  );
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

  it('renders additional actions beside the standard toolbar controls', () => {
    const renderAdditionalToolbarActions = vi.fn(() => <button>Group by label</button>);
    renderTable({ renderAdditionalToolbarActions });
    const table = toolbarTable();
    const toolbar = tableMocks.options.renderToolbarInternalActions({ table });

    render(<ThemeProvider theme={theme}>{toolbar}</ThemeProvider>);

    expect(screen.getByTestId('search-toggle')).toBeVisible();
    expect(screen.getByTestId('filters-toggle')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Group by label' })).toBeVisible();
    expect(screen.getByTestId('column-visibility')).toBeVisible();
    expect(renderAdditionalToolbarActions).toHaveBeenCalledWith({ table });
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

  it('does not responsively hide columns that disable hiding', () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(150);

    renderTable({
      columns: [
        { id: 'selected', accessorKey: 'selected', header: 'Selection' },
        {
          id: 'name',
          accessorKey: 'name',
          header: 'Name',
          enableHiding: false,
          responsivePriority: -1,
        },
        { id: 'status', header: 'Status' },
      ],
    });

    expect(tableMocks.options.state.columnVisibility).toEqual({ status: false });

    clientWidth.mockRestore();
  });

  it('does not keep restoring the actions column while responsive layout hides it', () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(150);
    tableMocks.columnVisibility = { actions: false };

    renderTable({
      columns: [
        { id: 'name', accessorKey: 'name', header: 'Name' },
        { id: 'actions', header: 'Actions' },
      ],
    });

    expect(tableMocks.options.state.columnVisibility.actions).toBe(false);
    expect(tableMocks.setColumnVisibility).toHaveBeenCalledOnce();

    clientWidth.mockRestore();
  });

  it('honors explicit visibility for locked columns over internal visibility', () => {
    renderTable({
      columns: [
        { id: 'name', header: 'Name' },
        { id: 'labels', header: 'Labels', enableHiding: false },
        { id: 'group', header: 'Group', enableHiding: false },
        { id: 'status', header: 'Status' },
      ],
      initialState: { columnVisibility: { labels: false, group: true, status: false } },
      state: { columnVisibility: { labels: true, group: false, status: true } },
    });

    expect(tableMocks.options.state.columnVisibility).toEqual({
      labels: true,
      group: false,
      status: false,
    });
  });

  it('hides and restores the actions column with data-column visibility', () => {
    const columns: TableProps<TestRow>['columns'] = [
      { id: 'selected', accessorKey: 'selected', header: 'Selection' },
    ];

    const hiddenResult = renderTable({
      columns,
      enableRowActions: true,
      state: { columnVisibility: { selected: false } },
    });

    expect(tableMocks.options.state.columnVisibility['mrt-row-actions']).toBe(false);
    hiddenResult.unmount();

    renderTable({
      columns,
      enableRowActions: true,
      state: { columnVisibility: { selected: true } },
    });

    expect(tableMocks.options.state.columnVisibility['mrt-row-actions']).not.toBe(false);
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
    return {
      columnDef,
      getFacetedRowModel: () => rowModel,
      getIsFiltered: () => false,
      getFilterValue: () => undefined,
    };
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
    ['serves every option of a column at the cap', 1000],
    ['serves the cap worth of options for a column above it', 1001],
  ])('%s', (_description: string, distinctValues: number) => {
    const rows = Array.from({ length: distinctValues }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    expect(facetedUniqueValues('status', rows).size).toBe(1000);
  });

  it('keeps the most common values when it has to shorten the list', () => {
    // The common value comes last, so keeping it proves the list is cut by frequency and
    // not simply by insertion order.
    const rows = [
      ...Array.from({ length: 1000 }, (_, index) => ({ status: `rare-${index}` })),
      ...Array.from({ length: 5 }, () => ({ status: 'common' })),
    ];
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const values = facetedUniqueValues('status', rows);

    expect(values.size).toBe(1000);
    expect(values.get('common')).toBe(5);
    expect(values.has('rare-999')).toBe(false);
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
        getFilterValue: () => undefined,
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

  it('keeps a filtered-for value that the cap would drop', () => {
    // The rare value is what the column is filtered by, so it has to stay offered even
    // though its count puts it far outside the most common ones.
    const rows = [
      ...Array.from({ length: 1000 }, (_, index) => ({ status: `common-${index}` })),
      { status: 'rare' },
    ];
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const columnDef = tableMocks.options.columns[0];
    const column = {
      ...makeFacetedColumn(columnDef, rows),
      getFilterValue: () => ['rare'],
    };
    const values = tableMocks.options.getFacetedUniqueValues(makeFacetedTable(column), 'status')();

    expect(values.has('rare')).toBe(true);
    // The least common unselected value makes room for it, the cap itself holds.
    expect(values.size).toBe(1000);
  });

  it.each([
    ['below the cap', 3],
    ['past the cap', 1001],
  ])('keeps offering a selected value a refresh took out of the rows, %s', (_description, size) => {
    // MRT reads the chip label of a selected value back from these options, so a value
    // that left the data has to stay among them while it is filtered for.
    const rows = Array.from({ length: size }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const columnDef = tableMocks.options.columns[0];
    const column = {
      ...makeFacetedColumn(columnDef, rows),
      getFilterValue: () => ['gone'],
    };
    const values = tableMocks.options.getFacetedUniqueValues(makeFacetedTable(column), 'status')();

    expect(values.get('gone')).toBe(0);
    expect(values.size).toBe(Math.min(size + 1, 1000));
  });

  it('does not call a list shortened that only gained an absent selection', () => {
    const rows = Array.from({ length: 999 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    column.getFilterValue = () => ['gone'];
    const props = tableMocks.options.muiFilterTextFieldProps({ column, table });

    expect(column.getFacetedUniqueValues().size).toBe(1000);
    expect(props.helperText).toBeUndefined();
  });

  it('serves the same map on every render while an absent selection stands', () => {
    // MRT memoizes the dropdown on the identity of this map.
    const rows = Array.from({ length: 3 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    column.getFilterValue = () => ['gone'];

    const first = tableMocks.options.getFacetedUniqueValues(table, 'status')();
    expect(first.get('gone')).toBe(0);
    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')()).toBe(first);
  });

  it('does not offer the free text of an autocomplete filter as a value', () => {
    // The autocomplete shows its own input rather than an option's label, and what it is
    // filtered by is whatever was typed.
    const rows = Array.from({ length: 3 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('autocomplete')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    column.getFilterValue = () => 's';

    expect([...tableMocks.options.getFacetedUniqueValues(table, 'status')().keys()]).toEqual([
      's0',
      's1',
      's2',
    ]);
  });

  it('builds a new view when an autocomplete column turns into a dropdown', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('autocomplete')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    column.getFilterValue = () => 'gone';
    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().has('gone')).toBe(false);
    // Same row model, so the cached walk is reused, but not the view built for the old variant.
    column.columnDef = { ...column.columnDef, filterVariant: 'multi-select' };
    column.getFilterValue = () => ['gone'];

    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().get('gone')).toBe(0);
  });

  it('builds a new view when the filter changes to a value that only reads the same', () => {
    // A non-string filter value cannot be offered, its string twin can. Both must not share
    // one cached view.
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    column.getFilterValue = () => [5];
    const forNumber = tableMocks.options.getFacetedUniqueValues(table, 'status')();
    // MRT sorts the options with localeCompare, which a number would throw on.
    expect([...forNumber.keys()].every(value => typeof value === 'string')).toBe(true);
    expect(forNumber.has('5')).toBe(false);
    column.getFilterValue = () => ['5'];

    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().get('5')).toBe(0);
  });

  it('walks again when the filter moved to a value the cached set does not carry', () => {
    const rows = [
      ...Array.from({ length: 1000 }, (_, index) => ({ status: `common-${index}` })),
      { status: 'rare' },
    ];
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const columnDef = tableMocks.options.columns[0];
    const faceted = makeFacetedColumn(columnDef, rows);
    const filter: { value: unknown } = { value: undefined };
    const column = { ...faceted, getFilterValue: () => filter.value };
    const table = makeFacetedTable(column);

    // Same row model, first read without a filter, then with one on the dropped value.
    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().has('rare')).toBe(false);
    filter.value = ['rare'];
    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')().has('rare')).toBe(true);
  });

  it('serves the cache while the filter stands, even for a value the rows do not carry', () => {
    // The namespace selector can filter the rows away under an active column filter. Looking
    // for that value in the result would then miss the cache on every single render.
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const accessorFn = vi.fn((row: any) => row.status);
    const columnDef = { ...tableMocks.options.columns[0], accessorFn };
    const column = {
      ...makeFacetedColumn(columnDef, rows),
      getFilterValue: () => ['gone-from-the-rows'],
    };
    const table = makeFacetedTable(column);

    tableMocks.options.getFacetedUniqueValues(table, 'status')();
    const afterFirstWalk = accessorFn.mock.calls.length;
    tableMocks.options.getFacetedUniqueValues(table, 'status')();

    expect(afterFirstWalk).toBe(rows.length);
    expect(accessorFn.mock.calls.length).toBe(afterFirstWalk);
  });

  it('does not walk the rows again when only the filter moved', () => {
    // The walk reads the pre-filtered rows, which the column's own filter does not touch,
    // so a filter change may reshape the offered options but must not repeat the walk.
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const accessorFn = vi.fn((row: any) => row.status);
    const columnDef = { ...tableMocks.options.columns[0], accessorFn };
    const filter: { value: unknown } = { value: undefined };
    const column = {
      ...makeFacetedColumn(columnDef, rows),
      getFilterValue: () => filter.value,
    };
    const table = makeFacetedTable(column);

    const first = tableMocks.options.getFacetedUniqueValues(table, 'status')();
    const afterFirstWalk = accessorFn.mock.calls.length;

    filter.value = ['s1000'];
    const second = tableMocks.options.getFacetedUniqueValues(table, 'status')();

    expect(afterFirstWalk).toBe(rows.length);
    expect(accessorFn.mock.calls.length).toBe(afterFirstWalk);
    // The shortened view is rebuilt around the new filter, the values behind it are not.
    expect(second.has('s1000')).toBe(true);
    expect(first.has('s1000')).toBe(false);
  });

  it('keeps serving the same shortened map while the filter stands', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const columnDef = tableMocks.options.columns[0];
    const column = makeFacetedColumn(columnDef, rows);
    const table = makeFacetedTable(column);

    // MRT memoizes its dropdown options on this identity, so it has to hold still.
    const first = tableMocks.options.getFacetedUniqueValues(table, 'status')();
    expect(tableMocks.options.getFacetedUniqueValues(table, 'status')()).toBe(first);
  });

  it.each([
    ['an object', { color: 'error.main' }],
    // An sx may also be a callback or an array, which spreading would have thrown away.
    ['a callback', () => ({ color: 'error.main' })],
    ['an array', [{ color: 'error.main' }]],
  ])('keeps caller styling given as %s on the note it adds', (_description, sx) => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({
      columns: [statusColumn('multi-select')],
      data: rows as any,
      muiFilterTextFieldProps: { FormHelperTextProps: { sx } } as any,
    });

    const props = filterTextFieldProps(rows);

    expect(props.helperText).toBe('Showing 1000 values, some less common ones are not listed');
    // The note's own styling comes first, the caller's on top of it, in whatever shape.
    expect(props.FormHelperTextProps.sx[0]).toMatchObject({ whiteSpace: 'normal' });
    expect(props.FormHelperTextProps.sx.slice(1)).toEqual(Array.isArray(sx) ? sx : [sx]);
  });

  it('holds the cap even when more values are selected than it allows', () => {
    const rows = Array.from({ length: 1200 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const columnDef = tableMocks.options.columns[0];
    const column = {
      ...makeFacetedColumn(columnDef, rows),
      getFilterValue: () => rows.map(row => row.status),
    };

    const values = tableMocks.options.getFacetedUniqueValues(makeFacetedTable(column), 'status')();

    expect(values.size).toBe(1000);
  });

  it('notes under the input that a shortened list is shown', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    expect(filterTextFieldProps(rows).helperText).toBe(
      'Showing 1000 values, some less common ones are not listed'
    );
  });

  it('drops the notice when the column definition gains caller filter options', () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ status: `s${index}` }));
    renderTable({ columns: [statusColumn('multi-select')], data: rows as any });

    const { column, table } = makeFilterColumn(rows);
    const props = () => tableMocks.options.muiFilterTextFieldProps({ column, table });

    expect(props().helperText).toBe('Showing 1000 values, some less common ones are not listed');

    // Same column instance, definition swapped in place: the verdict must not survive.
    column.columnDef = { ...column.columnDef, filterSelectOptions: ['Custom'] };
    expect(props().helperText).toBeUndefined();

    column.columnDef = {
      ...column.columnDef,
      filterSelectOptions: undefined,
      filterVariant: 'text',
    };
    expect(props().helperText).toBeUndefined();
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

    expect(
      tableMocks.options.muiFilterTextFieldProps({ column, table }).helperText
    ).toBeUndefined();
  });

  it('adds no notice while a column stays below the cap', () => {
    renderTable({ columns: [statusColumn('multi-select')], data: statusRows as any });

    expect(filterTextFieldProps(statusRows).helperText).toBeUndefined();
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
    expect(props.helperText).toBe('Showing 1000 values, some less common ones are not listed');
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
      'the note when only the column asks for modes',
      {},
      { enableColumnFilterModes: true },
      'Showing 1000 values, some less common ones are not listed',
    ],
    [
      'adds',
      'the note when the column opts out of modes',
      { enableColumnFilterModes: true },
      { enableColumnFilterModes: false },
      'Showing 1000 values, some less common ones are not listed',
    ],
    // MRT renders no mode button, and no label, without options to switch between.
    [
      'adds',
      'the note when no filter mode is left to pick',
      { enableColumnFilterModes: true, columnFilterModeOptions: [] },
      {},
      'Showing 1000 values, some less common ones are not listed',
    ],
  ])(
    '%s %s on a truncated autocomplete column',
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
    expect(filterTextFieldProps(rows).helperText).toBeUndefined();
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
