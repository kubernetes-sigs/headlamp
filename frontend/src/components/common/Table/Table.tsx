import { Box, Paper, Table as MuiTable, TableCellProps, TableHead } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { alpha, styled } from '@mui/system';
import {
  MRT_BottomToolbar,
  MRT_Cell,
  MRT_ColumnDef as MaterialTableColumn,
  MRT_Header,
  MRT_Localization,
  MRT_TableBodyCell,
  MRT_TableHeadCell,
  MRT_TableInstance,
  MRT_TableOptions as MaterialTableOptions,
  MRT_TopToolbar,
  useMaterialReactTable,
  useMRT_Rows,
} from 'material-react-table';
import { MRT_Localization_DE } from 'material-react-table/locales/de';
import { MRT_Localization_EN } from 'material-react-table/locales/en';
import { MRT_Localization_ES } from 'material-react-table/locales/es';
import { MRT_Localization_FR } from 'material-react-table/locales/fr';
import { MRT_Localization_IT } from 'material-react-table/locales/it';
import { MRT_Localization_PT } from 'material-react-table/locales/pt';
import { memo, ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import helpers from '../../../helpers';
import { useURLState } from '../../../lib/util';
import { useSettings } from '../../App/Settings/hook';
import Empty from '../EmptyContent';
import Loader from '../Loader';

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
   * @example [15, 25, 50]
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
  }, [zeroIndexPage]);

  return [zeroIndexPage, setZeroIndexPage];
}

const tableLocalizationMap: Record<string, MRT_Localization> = {
  de: MRT_Localization_DE,
  en: MRT_Localization_EN,
  es: MRT_Localization_ES,
  fr: MRT_Localization_FR,
  it: MRT_Localization_IT,
  pt: MRT_Localization_PT,
};

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

  const storeRowsPerPageOptions = useSettings('tableRowsPerPageOptions');
  const rowsPerPageOptions = rowsPerPage || storeRowsPerPageOptions;
  const defaultRowsPerPage = useMemo(() => helpers.getTablesRowsPerPage(rowsPerPageOptions[0]), []);
  const [pageSize, setPageSize] = useURLState(shouldReflectInURL ? 'perPage' : '', {
    defaultValue: defaultRowsPerPage,
    prefix,
  });

  const { t, i18n } = useTranslation();
  const theme = useTheme();

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

  const table = useMaterialReactTable({
    ...tableProps,
    columns: tableColumns ?? [],
    data: tableData,
    enablePagination: tableData.length > rowsPerPageOptions[0],
    enableDensityToggle: tableProps.enableDensityToggle ?? false,
    enableFullScreenToggle: tableProps.enableFullScreenToggle ?? false,
    enableColumnActions: false,
    localization: tableLocalizationMap[i18n.language],
    autoResetAll: false,
    onPaginationChange: (updater: any) => {
      if (!tableProps.data?.length) return;
      const pagination = updater({ pageIndex: Number(page) - 1, pageSize: Number(pageSize) });
      setPage(pagination.pageIndex + 1);
      setPageSize(pagination.pageSize);
    },
    renderToolbarInternalActions: props => {
      const isSomeRowsSelected =
        tableProps.enableRowSelection && props.table.getSelectedRowModel().rows.length !== 0;
      if (isSomeRowsSelected) {
        const renderRowSelectionToolbar = tableProps.renderRowSelectionToolbar;
        if (renderRowSelectionToolbar !== undefined) {
          return renderRowSelectionToolbar(props);
        }
      }
      return null;
    },
    initialState: {
      density: 'compact',
      ...(tableProps.initialState ?? {}),
    },
    state: {
      ...(tableProps.state ?? {}),
      columnOrder: columnOrder,
      pagination: {
        pageIndex: page - 1,
        pageSize: pageSize,
      },
    },
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

  const gridTemplateColumns = useMemo(() => {
    let preGridTemplateColumns = tableProps.columns
      .filter((it, i) => {
        const id = it.id ?? String(i);
        const isHidden =
          table.getState().columnVisibility?.[id] === false ||
          tableProps.state?.columnVisibility?.[id] === false;
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
    table.getState()?.columnVisibility,
    tableProps.state?.columnVisibility,
    tableProps.enableRowActions,
    tableProps.enableRowSelection,
  ]);

  const rows = useMRT_Rows(table);

  if (!!errorMessage) {
    return <Empty color="error">{errorMessage}</Empty>;
  }

  if (loading) {
    return <Loader title={t('Loading table data')} />;
  }

  if (!tableProps.data?.length && !loading) {
    return (
      <Paper variant="outlined">
        <Empty>{emptyMessage || t('No data to be shown.')}</Empty>
      </Paper>
    );
  }

  const headerGroups = table.getHeaderGroups();

  return (
    <>
      <MRT_TopToolbar table={table} />
      <MuiTable
        sx={{
          display: 'grid',
          border: '1px solid',
          borderColor: theme.palette.tables.head.borderColor,
          borderRadius: 1,
          borderBottom: 'none',
          overflow: 'hidden',
          gridTemplateColumns,
        }}
      >
        <TableHead sx={{ display: 'contents' }}>
          <StyledHeadRow>
            {headerGroups[0].headers.map(header => (
              <MemoHeadCell
                key={header.id}
                header={header}
                table={table}
                isFiltered={header.column.getIsFiltered()}
                sorting={header.column.getIsSorted()}
                showColumnFilters={table.getState().showColumnFilters}
                selected={table.getSelectedRowModel().flatRows.length}
              />
            ))}
          </StyledHeadRow>
        </TableHead>
        <StyledBody>
          {rows.map(row => (
            <Row
              key={row.id}
              cells={row.getVisibleCells()}
              table={table}
              isSelected={row.getIsSelected()}
            />
          ))}
        </StyledBody>
      </MuiTable>
      <MRT_BottomToolbar table={table} />
    </>
  );
}

const MemoHeadCell = memo(
  ({
    header,
    table,
  }: {
    table: MRT_TableInstance<any | null>;
    header: MRT_Header<any>;
    sorting: string | false;
    isFiltered: boolean;
    selected: number;
    showColumnFilters: boolean;
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
    (a.header.column.id === 'mrt-row-select' ? a.selected === b.selected : true)
);

const Row = memo(
  ({
    cells,
    table,
    isSelected,
  }: {
    table: MRT_TableInstance<any>;
    cells: MRT_Cell<any, unknown>[];
    isSelected: boolean;
  }) => (
    <StyledRow data-selected={isSelected}>
      {cells.map(cell => (
        <MemoCell
          cell={cell}
          table={table}
          key={cell.id}
          isRowSelected={cell.row.getIsSelected()}
        />
      ))}
    </StyledRow>
  )
);

const MemoCell = memo(
  ({ cell, table }: { cell: MRT_Cell<any, unknown>; table: any; isRowSelected: boolean }) => {
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
      ? a.isRowSelected === b.isRowSelected
      : true)
);
