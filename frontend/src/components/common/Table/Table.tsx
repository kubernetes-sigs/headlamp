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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { useTheme } from '@mui/material/styles';
import MuiTable from '@mui/material/Table';
import { TableCellProps } from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import { alpha, styled } from '@mui/system';
import { visuallyHidden } from '@mui/utils';
import {
  MRT_BottomToolbar,
  MRT_Cell,
  MRT_Column,
  MRT_ColumnDef as MaterialTableColumn,
  MRT_Header,
  MRT_TableBodyCell,
  MRT_TableHeadCell,
  MRT_TableInstance,
  MRT_TableOptions as MaterialTableOptions,
  MRT_ToggleDensePaddingButton,
  MRT_ToggleFiltersButton,
  MRT_ToggleFullScreenButton,
  MRT_ToggleGlobalFilterButton,
  MRT_TopToolbar,
  useMaterialReactTable,
  useMRT_Rows,
} from 'material-react-table';
import { memo, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTablesRowsPerPage, setTablesRowsPerPage } from '../../../helpers/tablesRowsPerPage';
import { useShortcut } from '../../../lib/useShortcut';
import { useURLState } from '../../../lib/util';
import { useSettings } from '../../App/Settings/hook';
import { useQueryParamsState } from '../../resourceMap/useQueryParamsState';
import Empty from '../EmptyContent';
import Loader from '../Loader';
import { ColumnVisibilityButton } from './ColumnVisibilityButton';
import { getTableLocalization } from './tableLocalization';

/**
 * Column definition
 * We reuse the Material React Table column definition
 * Additional gridTemplate property is added because we have our own layout
 * based on the CSS grid
 *
 * @see https://www.material-react-table.com/docs/api/column-options
 */
export type TableColumn<RowItem extends Record<string, any>, Value = any> = MaterialTableColumn<
  RowItem,
  Value
> & {
  /**
   * Column width in the grid template format
   * Number values will be converted to "fr"
   * @example
   * 1
   * "1.5fr"
   * "min-content"
   */
  gridTemplate?: string | number;
  /**
   * Relative importance for the responsive layout. When space is limited, columns
   * with a lower priority are hidden first; the first column is never hidden.
   * Columns without an explicit priority default to `0`.
   * @default 0
   */
  responsivePriority?: number;
};

/**
 * All the options provided by the MRT and some of our custom behaviour
 *
 * @see https://www.material-react-table.com/docs/api/table-options
 */
export type TableProps<RowItem extends Record<string, any>> = Omit<
  MaterialTableOptions<RowItem>,
  'columns'
> & {
  columns: TableColumn<RowItem>[];
  /**
   * Message to show when the table is empty
   */
  emptyMessage?: ReactNode;
  /**
   * Error message to show instead of the table
   */
  errorMessage?: ReactNode;
  /** Whether to reflect the page/perPage properties in the URL.
   * If assigned to a string, it will be the prefix for the page/perPage parameters.
   * If true or '', it'll reflect the parameters without a prefix.
   * By default, no parameters are reflected in the URL. */
  reflectInURL?: string | boolean;
  /**
   * Initial page to show in the table
   * Important: page is 1-indexed!
   * @default 1
   */
  initialPage?: number;
  /**
   * List of options for the rows per page selector
   * @example [15, 25, 50, 100]
   */
  rowsPerPage?: number[];
  /**
   * Function to filter the rows
   * Works in addition to the default table filtering and searching
   */
  filterFunction?: (item: RowItem) => boolean;
  /**
   * Whether to show a loading spinner
   */
  loading?: boolean;
  renderRowSelectionToolbar?: (props: { table: MRT_TableInstance<RowItem> }) => ReactNode;
};

// Use a zero-indexed "useURLState" hook, so pages are shown in the URL as 1-indexed
// but internally are 0-indexed.
function usePageURLState(
  key: string,
  prefix: string,
  initialPage: number
): ReturnType<typeof useURLState> {
  const [page, setPage] = useURLState(key, { defaultValue: initialPage + 1, prefix });
  const [zeroIndexPage, setZeroIndexPage] = useState(page - 1);

  useEffect(() => {
    setZeroIndexPage((zeroIndexPage: number) => {
      if (page - 1 !== zeroIndexPage) {
        return page - 1;
      }

      return zeroIndexPage;
    });
  }, [page]);

  useEffect(() => {
    setPage(zeroIndexPage + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zeroIndexPage]);

  return [zeroIndexPage, setZeroIndexPage];
}

const StyledHeadRow = styled('tr')(({ theme }) => ({
  display: 'contents',
  background: theme.palette.background.muted,
}));
const StyledRow = styled('tr')(({ theme }) => ({
  display: 'contents',
  '&[data-selected=true]': {
    background: alpha(theme.palette.primary.main, 0.2),
  },
}));
const StyledBody = styled('tbody')({ display: 'contents' });

/**
 * Approximate minimum width (px) used to decide whether a column still fits.
 */
const DEFAULT_MIN_COLUMN_WIDTH = 100;

/**
 * Upper bound for the options of a single select filter. MRT renders one unvirtualized menu
 * item per option, so a high-cardinality column (Node on a large cluster) is served its most
 * common values instead of freezing the tab on every open.
 */
const MAX_FILTER_OPTIONS = 1000;

/** Served when a column has no options to offer, which is what MRT reads as "no dropdown". */
const NO_FACETED_VALUES = new Map<any, number>();

/**
 * The maps MAX_FILTER_OPTIONS truncated, so the dropdown can say that it lists only part of
 * the values. Marked by identity rather than remembered per column, so a column definition
 * that changes at runtime cannot leave a stale verdict behind.
 */
const truncatedFacetedValues = new WeakSet<Map<any, number>>();

/**
 * Faceted values per row model and column. MRT rebuilds its column array on every render
 * (prepareColumns is not memoized), and TanStack binds one closure per column object along
 * with a freshly spread column definition, so neither can hold or validate a cache across
 * renders. The row model is the one identity that lives exactly as long as the values it
 * yields: TanStack freezes row.getUniqueValues per row and column for the model's lifetime,
 * so recomputing any sooner could not even observe a changed accessor.
 */
const facetedValuesByRows = new WeakMap<object, Map<string, Map<any, number>>>();

/** Whether a column's options were truncated by MAX_FILTER_OPTIONS. */
function isTruncated<RowItem extends Record<string, any>>(column: MRT_Column<RowItem>) {
  return truncatedFacetedValues.has(column.getFacetedUniqueValues());
}

/**
 * Select-filter dropdowns get their options from MRT's faceted values, but callers turn
 * faceting off above a dataset threshold (TanStack's default builds a unique-value map for
 * every column), which left those dropdowns empty on large lists. This walks the dropdown
 * columns only, and only while their options are on screen, since MRT reads faceted values
 * on every header render. It relies on two undocumented MRT behaviors, pinned in
 * Table.facetedFilterOptions.test.tsx: caller options win over MRT's own
 * `enableFacetedValues ? ... : undefined`, and the dropdown reads faceted values regardless
 * of that flag.
 */
const getDropdownFacetedUniqueValues: NonNullable<
  MaterialTableOptions<Record<string, any>>['getFacetedUniqueValues']
> = (table, columnId) => {
  // TanStack types the option's table without MRT's additions; at runtime it is the
  // MRT instance.
  const mrtTable = table as unknown as MRT_TableInstance<Record<string, any>>;
  return () => {
    const column = table.getColumn(columnId);
    const columnDef = column?.columnDef as TableColumn<Record<string, any>> | undefined;
    const filterVariant = columnDef?.filterVariant;
    if (
      !column ||
      (filterVariant !== 'select' &&
        filterVariant !== 'multi-select' &&
        filterVariant !== 'autocomplete') ||
      // Caller options win in MRT, which then also drops the value counts these feed.
      columnDef?.filterSelectOptions
    ) {
      return NO_FACETED_VALUES;
    }
    // Faceting on: the column's faceted row model. Faceting off: TanStack falls back to
    // the pre-filtered rows (post-filterFunction), so the options are a superset of what
    // the table shows and the counts MRT renders next to them are dataset-wide. Narrowing
    // them would need the per-column faceted row models the guard turned off.
    const { flatRows } = column.getFacetedRowModel();
    const cachedColumns = facetedValuesByRows.get(flatRows);
    const cached = cachedColumns?.get(columnId);
    if (cached) {
      return cached;
    }
    // Nobody can see the options while the filter UI is hidden and no filter is active,
    // so do not walk the rows for them. Showing the UI re-renders the headers and lands
    // here again with the walk allowed. From there every data update walks again, which
    // measured around 8 ms per dropdown column per 10k rows.
    // Only the subheader mode ties the filter UI to showColumnFilters, the popover and
    // custom modes render it on their own terms — there the walk also runs while no popover
    // is open, since opening one does not re-render the headers, so empty options would
    // stick. The cap and the per-row-model cache bound that idle cost.
    const optionsAreVisible =
      mrtTable.getState().showColumnFilters ||
      (mrtTable.options.columnFilterDisplayMode ?? 'subheader') !== 'subheader' ||
      column.getIsFiltered();
    if (!optionsAreVisible) {
      return NO_FACETED_VALUES;
    }
    const values = new Map<any, number>();
    // MRT sorts the options with localeCompare, so anything but a string throws during
    // the header render. Such a column keeps the empty dropdown it had before.
    let sortable = true;
    for (const row of flatRows) {
      for (const value of row.getUniqueValues(columnId) ?? []) {
        // MRT drops these before rendering the options, so they must not count either.
        if (value === null || value === undefined) {
          continue;
        }
        if (typeof value !== 'string') {
          sortable = false;
          break;
        }
        values.set(value, (values.get(value) ?? 0) + 1);
      }
      if (!sortable) {
        break;
      }
    }
    let result = values;
    if (!sortable) {
      result = NO_FACETED_VALUES;
    } else if (values.size > MAX_FILTER_OPTIONS) {
      // MRT renders one unvirtualized menu item per option, so keep the most frequent values,
      // which are the ones worth offering as a filter.
      result = new Map([...values].sort(([, a], [, b]) => b - a).slice(0, MAX_FILTER_OPTIONS));
      truncatedFacetedValues.add(result);
    }
    const perColumn = cachedColumns ?? new Map();
    perColumn.set(columnId, result);
    facetedValuesByRows.set(flatRows, perColumn);
    return result;
  };
};

/**
 * Tracks the current width of an element using a ResizeObserver.
 * Returns 0 until the element has been measured.
 */
function useContainerWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * Table component based on the Material React Table
 *
 * @see https://www.material-react-table.com/docs
 */
export default function Table<RowItem extends Record<string, any>>({
  emptyMessage,
  reflectInURL,
  initialPage = 1,
  rowsPerPage,
  filterFunction,
  errorMessage,
  loading,
  ...tableProps
}: TableProps<RowItem>) {
  const shouldReflectInURL = reflectInURL !== undefined && reflectInURL !== false;
  const prefix = reflectInURL === true ? '' : reflectInURL || '';
  const [page, setPage] = usePageURLState(shouldReflectInURL ? 'p' : '', prefix, initialPage);
  const filterKey = prefix ? `${prefix}filter` : 'filter';
  const [globalFilterState, setGlobalFilterState] = useState<string | undefined>(
    tableProps.initialState?.globalFilter
  );
  const [globalFilterQueryParam, setGlobalFilterQueryParam] = useQueryParamsState<
    string | undefined
  >(
    shouldReflectInURL ? filterKey : '',
    shouldReflectInURL ? tableProps.initialState?.globalFilter : undefined
  );

  // When `reflectInURL` is enabled, the filter needs to stay in sync with the URL
  // query parameter. Otherwise we keep the filter in plain React state only.
  const [globalFilter, setGlobalFilter] = shouldReflectInURL
    ? [globalFilterQueryParam, setGlobalFilterQueryParam]
    : [globalFilterState, setGlobalFilterState];

  const storeRowsPerPageOptions = useSettings('tableRowsPerPageOptions');
  const rowsPerPageOptions = rowsPerPage || storeRowsPerPageOptions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const defaultRowsPerPage = getTablesRowsPerPage(rowsPerPageOptions[0]);
  const [pageSize, setPageSize] = useURLState(shouldReflectInURL ? 'perPage' : '', {
    defaultValue: defaultRowsPerPage,
    prefix,
  });

  const { t, i18n } = useTranslation();
  const theme = useTheme();

  // State for shift+click range selection
  const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState<number | null>(null);

  // Measure the available width so we can hide columns that don't fit instead of
  // crushing them or falling back to a horizontal scrollbar (kubernetes-sigs/headlamp#1232).
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const containerWidth = useContainerWidth(tableContainerRef);

  // Controlled column visibility so responsive hiding, caller-provided visibility
  // and MRT's own visibility changes all stay in sync.
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(
    tableProps.initialState?.columnVisibility ?? {}
  );

  // Provide defaults for the columns
  const tableColumns: TableColumn<RowItem>[] = useMemo(
    () =>
      tableProps.columns.map((column, i) => ({
        ...column,
        id: column.id ?? String(i),
        header: column.header || '',
      })),
    [tableProps.columns]
  );

  const tableData = useMemo(() => {
    if (!filterFunction) return tableProps.data ?? [];
    return (tableProps.data ?? []).filter(it => filterFunction(it));
  }, [tableProps.data, filterFunction]);

  const paginationSelectProps = import.meta.env.UNDER_TEST
    ? {
        inputProps: {
          SelectDisplayProps: {
            'aria-controls': 'test-id',
          },
        },
      }
    : undefined;

  const columnOrder = useMemo(() => {
    const ids: string[] = tableProps.columns.map((it, i) => it.id ?? String(i));
    if (tableProps.enableRowActions) {
      ids.push('mrt-row-actions');
    }
    if (tableProps.enableRowSelection) {
      ids.unshift('mrt-row-select');
    }

    return ids;
  }, [tableProps.columns, tableProps.enableRowActions, tableProps.enableRowSelection]);

  // Decide which columns to hide based on the available width. Columns are hidden by
  // ascending `responsivePriority` (least important first), then right-to-left among
  // equal priority. The first column is never hidden. When everything fits, nothing
  // is hidden and the table renders as usual.
  const responsiveHidden = useMemo(() => {
    const result: Record<string, boolean> = {};
    if (!containerWidth) {
      return result;
    }

    const callerVisibility = tableProps.state?.columnVisibility;
    const dataCols = tableColumns.filter(col => callerVisibility?.[col.id ?? ''] !== false);

    let reserved = 0;
    if (tableProps.enableRowSelection) {
      reserved += 44; // selection checkbox column
    }
    if (tableProps.enableRowActions) {
      reserved += 52; // row actions column
    }

    const available = containerWidth - reserved;
    let total = dataCols.length * DEFAULT_MIN_COLUMN_WIDTH;
    if (total <= available) {
      return result;
    }

    // Columns we're allowed to hide, ordered by what to drop first.
    dataCols
      .map((col, index) => ({ col, index }))
      .filter(({ index }) => index !== 0)
      .sort((a, b) => {
        const priorityDiff = (a.col.responsivePriority ?? 0) - (b.col.responsivePriority ?? 0);
        return priorityDiff !== 0 ? priorityDiff : b.index - a.index;
      })
      .forEach(({ col }) => {
        if (total <= available) {
          return;
        }
        // MRT visibility semantics: `false` means the column is hidden.
        result[col.id ?? ''] = false;
        total -= DEFAULT_MIN_COLUMN_WIDTH;
      });
    return result;
  }, [
    containerWidth,
    tableColumns,
    tableProps.state?.columnVisibility,
    tableProps.enableRowSelection,
    tableProps.enableRowActions,
  ]);

  const mergedColumnVisibility = useMemo(
    () => ({
      ...(tableProps.state?.columnVisibility ?? {}),
      ...columnVisibility,
      ...responsiveHidden,
    }),
    [tableProps.state?.columnVisibility, columnVisibility, responsiveHidden]
  );

  // With faceting on, MRT installs TanStack's own implementation for every column, so ours
  // is only needed to fill the gap it leaves behind when faceting is off.
  const ownFacetedValues = !tableProps.enableFacetedValues && !tableProps.getFacetedUniqueValues;

  const table = useMaterialReactTable({
    ...tableProps,
    columns: tableColumns ?? [],
    data: tableData,
    // The key has to be absent, not undefined: MRT applies caller options over its own
    // wiring, so an undefined value would drop TanStack's default and its faceting contract.
    // The implementation only reads generic column metadata, so the erased row type is safe.
    ...(ownFacetedValues
      ? {
          getFacetedUniqueValues:
            getDropdownFacetedUniqueValues as MaterialTableOptions<RowItem>['getFacetedUniqueValues'],
        }
      : {}),
    // Say so when the dropdown lists only part of the values. MRT renders this text field
    // for every filter variant, so all three dropdowns carry the note in the same place.
    muiFilterTextFieldProps: args => {
      const callerProps =
        (typeof tableProps.muiFilterTextFieldProps === 'function'
          ? tableProps.muiFilterTextFieldProps(args)
          : tableProps.muiFilterTextFieldProps) ?? {};
      // Only the implementation above marks a map as truncated.
      if (!ownFacetedValues || !isTruncated(args.column)) {
        return callerProps;
      }
      // That spot already carries MRT's filter-mode label where modes are enabled, and saying
      // which mode is active beats saying that the list is shortened. MRT decides that from
      // the table-level flag, with the column able to opt out only. A caller-provided
      // helperText keeps precedence too, as it did before the note existed.
      const columnDef = args.column.columnDef as TableColumn<RowItem>;
      const filterModeOptions =
        columnDef.columnFilterModeOptions ?? tableProps.columnFilterModeOptions;
      const showsFilterMode =
        tableProps.enableColumnFilterModes &&
        columnDef.enableColumnFilterModes !== false &&
        (filterModeOptions === undefined || !!filterModeOptions?.length);
      if (showsFilterMode || callerProps.helperText !== undefined) {
        return callerProps;
      }
      return {
        ...callerProps,
        helperText: t('Showing the {{max}} most common values', { max: MAX_FILTER_OPTIONS }),
      };
    },
    enablePagination: tableData.length > rowsPerPageOptions[0],
    enableDensityToggle: tableProps.enableDensityToggle ?? false,
    enableFullScreenToggle: tableProps.enableFullScreenToggle ?? false,
    enableColumnActions: false,
    localization: getTableLocalization(i18n.resolvedLanguage || i18n.language),
    autoResetAll: false,
    icons: {
      ...tableProps.icons,
      MoreHorizIcon: () => <Icon icon="mdi:more-vert" />,
    },
    onPaginationChange: (updater: any) => {
      if (!tableProps.data?.length) return;
      const pagination = updater({ pageIndex: Number(page) - 1, pageSize: Number(pageSize) });
      setPage(pagination.pageIndex + 1);
      setPageSize(pagination.pageSize);
      if (pagination.pageSize !== Number(pageSize)) {
        setTablesRowsPerPage(pagination.pageSize);
      }
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    renderToolbarInternalActions: ({ table: tbl }) => {
      const isSomeRowsSelected =
        tableProps.enableRowSelection && tbl.getSelectedRowModel().rows.length !== 0;
      if (isSomeRowsSelected && tableProps.renderRowSelectionToolbar) {
        return tableProps.renderRowSelectionToolbar({ table: tbl });
      }

      const {
        enableFilters = true,
        enableGlobalFilter = true,
        enableColumnFilters = true,
        enableHiding = true,
        enableColumnOrdering,
        enableColumnPinning,
        enableDensityToggle,
        enableFullScreenToggle,
        columnFilterDisplayMode,
        initialState: initState,
      } = tbl.options;

      return (
        <>
          {enableFilters && enableGlobalFilter && !initState?.showGlobalFilter && (
            <MRT_ToggleGlobalFilterButton table={tbl} />
          )}
          {enableFilters && enableColumnFilters && columnFilterDisplayMode !== 'popover' && (
            <MRT_ToggleFiltersButton table={tbl} />
          )}
          {(enableHiding || enableColumnOrdering || enableColumnPinning) && (
            <ColumnVisibilityButton table={tbl} />
          )}
          {enableDensityToggle && <MRT_ToggleDensePaddingButton table={tbl} />}
          {enableFullScreenToggle && <MRT_ToggleFullScreenButton table={tbl} />}
        </>
      );
    },
    initialState: useMemo(
      () => ({
        density: 'compact',
        globalFilter: globalFilter || '',
        ...(tableProps.initialState ?? {}),
      }),
      [tableProps.initialState, globalFilter]
    ),
    state: useMemo(
      () => ({
        ...(tableProps.state ?? {}),
        columnOrder,
        columnVisibility: mergedColumnVisibility,
        pagination: {
          pageIndex: page - 1,
          pageSize: pageSize,
        },
        globalFilter,
        ...(globalFilter ? { showGlobalFilter: true } : {}),
      }),
      [tableProps.state, columnOrder, mergedColumnVisibility, page, pageSize, globalFilter]
    ),
    positionActionsColumn: 'last',
    layoutMode: 'grid',
    // Need to provide our own empty message
    // because default one breaks with our custom layout
    renderEmptyRowsFallback: () => (
      <Box height={60}>
        <Box position="absolute" left={0} right={0} textAlign="center">
          <Empty>{t('No results found')}</Empty>
        </Box>
      </Box>
    ),
    muiSearchTextFieldProps: {
      id: 'table-search-field',
    },
    muiPaginationProps: {
      rowsPerPageOptions: rowsPerPageOptions,
      showFirstButton: false,
      showLastButton: false,
      SelectProps: paginationSelectProps,
    },
    muiTableBodyCellProps: {
      sx: {
        // By default in compact mode text doesn't wrap
        // so we need to override that
        whiteSpace: 'normal',
        width: 'unset',
        minWidth: 'unset',
      },
    },
    muiTopToolbarProps: {
      sx: {
        height: '3.5rem',
        backgroundColor: undefined,
      },
    },
    muiBottomToolbarProps: {
      sx: {
        backgroundColor: undefined,
        boxShadow: undefined,
      },
    },
    muiTableHeadCellProps: {
      sx: {
        width: 'unset',
        minWidth: 'unset',
        '.MuiTableSortLabel-icon': {
          margin: 0,
          width: '14px',
          height: '14px',
          marginTop: '-2px',
        },
        ',MuiTableSortLabel-root': {
          width: 'auto',
        },
      },
    },
    muiSelectCheckboxProps: {
      size: 'small',
      sx: { padding: 0 },
    },
    muiSelectAllCheckboxProps: {
      size: 'small',
      sx: { padding: 0 },
    },
  });

  useShortcut(
    'TABLE_COLUMN_FILTERS',
    event => {
      event.stopPropagation();
      table.setShowColumnFilters(!table.getState().showColumnFilters);
    },
    {},
    [table]
  );

  // Hide actions column when others are hidden
  useEffect(() => {
    const visibility = table.getState().columnVisibility || {};

    const shouldHideActions = tableColumns
      .filter(col => (col.id ?? '') !== 'actions')
      .every(col => visibility[col.id ?? ''] === false);

    if (shouldHideActions && visibility['actions'] !== false) {
      table.setColumnVisibility(prev => ({ ...prev, actions: false }));
    } else if (!shouldHideActions && visibility['actions'] === false) {
      table.setColumnVisibility(prev => ({ ...prev, actions: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.getState().columnVisibility, tableColumns, table]);

  const gridTemplateColumns = useMemo(() => {
    let preGridTemplateColumns = tableProps.columns
      .filter((it, i) => {
        const id = it.id ?? String(i);
        const isHidden = mergedColumnVisibility?.[id] === false;
        return !isHidden;
      })
      .map(it => {
        if (typeof it.gridTemplate === 'number') {
          return `${it.gridTemplate}fr`;
        }
        return it.gridTemplate ?? '1fr';
      })
      .join(' ');
    if (tableProps.enableRowActions) {
      preGridTemplateColumns = `${preGridTemplateColumns} 0.05fr`;
    }
    if (tableProps.enableRowSelection) {
      preGridTemplateColumns = `44px ${preGridTemplateColumns}`;
    }

    return preGridTemplateColumns;
  }, [
    tableProps.columns,
    mergedColumnVisibility,
    tableProps.enableRowActions,
    tableProps.enableRowSelection,
  ]);

  const rows = useMRT_Rows(table);
  const rowIds = useMemo(() => rows.map(r => r.id), [rows]);

  // Handle shift+click range selection
  const handleRowClick = (e: React.MouseEvent, clickedIndex: number) => {
    if (!table || !table.getRowModel || tableProps.enableRowSelection === false) {
      return;
    }

    const target = e.target as HTMLElement | null;
    const shouldHandle =
      !!target &&
      !!target.closest('input[type="checkbox"]') &&
      !target.closest('.MuiSwitch-root, [role="switch"]') &&
      !target.closest('[role="dialog"]');

    if (!shouldHandle) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (e.shiftKey && lastSelectedRowIndex !== null) {
      const start = Math.min(lastSelectedRowIndex, clickedIndex);
      const end = Math.max(lastSelectedRowIndex, clickedIndex);

      const newSelected: Record<string, boolean> = {};
      for (let i = start; i <= end; i++) {
        const rowId = rowIds[i];
        if (rowId) {
          newSelected[rowId] = true;
        }
      }

      table.setRowSelection(prev => ({ ...prev, ...newSelected }));
    } else {
      const rowId = rowIds[clickedIndex];
      table.setRowSelection(prev => ({ ...prev, [rowId]: !prev[rowId] }));
      setLastSelectedRowIndex(clickedIndex);
    }
  };

  const emptyMsg = emptyMessage || t('No data to be shown.');
  const isEmpty = !tableProps.data?.length && !loading;
  const noSearchResults = !errorMessage && !loading && !isEmpty && rows.length === 0;
  const statusMsg = isEmpty ? emptyMsg : noSearchResults ? t('No results found') : '';

  // Defer status text by one render so NVDA always sees a change ('' → message).
  const [announcedStatus, setAnnouncedStatus] = useState<
    | string
    | number
    | true
    | React.ReactElement<any, string | React.JSXElementConstructor<any>>
    | Iterable<React.ReactNode>
  >('');
  useEffect(() => {
    setAnnouncedStatus(statusMsg);
  }, [statusMsg]);

  let content;
  if (!!errorMessage) {
    content = <Empty color="error">{errorMessage}</Empty>;
  } else if (loading) {
    content = <Loader title={t('Loading table data')} />;
  } else if (!tableProps.data?.length) {
    content = (
      <Paper variant="outlined">
        <Empty>{emptyMsg}</Empty>
      </Paper>
    );
  } else {
    const headerGroups = table.getHeaderGroups();

    content = (
      <>
        {(tableProps.enableTopToolbar ?? true) && <MRT_TopToolbar table={table} />}
        <MuiTable
          sx={{
            display: 'grid',
            border: '1px solid',
            borderColor: theme.palette.tables.head.borderColor,
            borderRadius: 1,
            borderBottom: 'none',
            overflowX: 'auto',
            width: '100%',
            gridTemplateColumns,
          }}
        >
          <TableHead sx={{ display: 'contents' }}>
            <StyledHeadRow>
              {headerGroups[0].headers.map(header => (
                <MemoHeadCell
                  key={header.id}
                  header={header as MRT_Header<Record<string, any>>}
                  table={table as MRT_TableInstance<Record<string, any>>}
                  isFiltered={header.column.getIsFiltered()}
                  sorting={header.column.getIsSorted()}
                  showColumnFilters={table.getState().showColumnFilters}
                  selected={table.getSelectedRowModel().flatRows.length}
                  filterValue={header.column.getFilterValue()}
                />
              ))}
            </StyledHeadRow>
          </TableHead>
          <StyledBody>
            {rows.map((row, index) => (
              <Row
                key={row.id}
                rowIndex={index}
                cells={row.getVisibleCells() as MRT_Cell<Record<string, any>, unknown>[]}
                table={table as MRT_TableInstance<Record<string, any>>}
                isSelected={row.getIsSelected()}
                onRowClick={handleRowClick}
              />
            ))}
          </StyledBody>
        </MuiTable>
        <MRT_BottomToolbar table={table} />
      </>
    );
  }

  return (
    <Box ref={tableContainerRef} sx={{ width: '100%' }}>
      <Box role="status" aria-live="polite" aria-atomic="true" sx={visuallyHidden}>
        {announcedStatus}
      </Box>
      {content}
    </Box>
  );
}

const MemoHeadCell = memo(
  <RowItem extends Record<string, any>>({
    header,
    table,
  }: {
    table: MRT_TableInstance<RowItem>;
    header: MRT_Header<RowItem>;
    sorting: string | false;
    isFiltered: boolean;
    selected: number;
    showColumnFilters: boolean;
    filterValue: any;
  }) => {
    return (
      <MRT_TableHeadCell
        header={header}
        key={header.id}
        staticColumnIndex={-1}
        table={table}
        sx={theme => ({ borderColor: theme.palette.divider })}
      />
    );
  },
  (a, b) =>
    a.header.column.id === b.header.column.id &&
    a.sorting === b.sorting &&
    a.isFiltered === b.isFiltered &&
    a.showColumnFilters === b.showColumnFilters &&
    (a.header.column.id === 'mrt-row-select' ? a.selected === b.selected : true) &&
    a.filterValue === b.filterValue
);

const Row = memo(
  <RowItem extends Record<string, any>>({
    cells,
    table,
    isSelected,
    onRowClick,
    rowIndex,
  }: {
    table: MRT_TableInstance<RowItem>;
    cells: MRT_Cell<RowItem, unknown>[];
    isSelected: boolean;
    onRowClick?: (e: React.MouseEvent, rowIndex: number) => void;
    rowIndex: number;
  }) => (
    <StyledRow data-selected={isSelected} onClickCapture={e => onRowClick?.(e, rowIndex)}>
      {cells.map(cell => (
        <MemoCell
          cell={cell as MRT_Cell<Record<string, any>, unknown>}
          table={table as MRT_TableInstance<Record<string, any>>}
          key={cell.id}
          isRowSelected={cell.row.getIsSelected()}
          canSelect={cell.row.getCanSelect()}
        />
      ))}
    </StyledRow>
  )
);

const MemoCell = memo(
  <RowItem extends Record<string, any>>({
    cell,
    table,
  }: {
    cell: MRT_Cell<RowItem, unknown>;
    table: MRT_TableInstance<RowItem>;
    isRowSelected: boolean;
    canSelect?: boolean;
  }) => {
    const column = cell.column.columnDef as TableColumn<any, unknown>;
    return (
      <MRT_TableBodyCell
        staticRowIndex={-1}
        cell={cell}
        table={table}
        rowRef={{ current: null }}
        sx={theme =>
          ({
            whiteSpace: 'normal',
            width: 'unset',
            minWidth: 'unset',
            wordBreak: column.gridTemplate === 'min-content' ? 'normal' : 'break-word',
            borderColor: theme.palette.divider,
            ...(column.muiTableBodyCellProps as TableCellProps)?.sx,
          } as any)
        }
      />
    );
  },
  (a, b) =>
    a.cell.getValue() === b.cell.getValue() &&
    (a.cell.column.id === 'mrt-row-select' && b.cell.column.id === 'mrt-row-select'
      ? a.canSelect === b.canSelect && a.isRowSelected === b.isRowSelected
      : true)
);
