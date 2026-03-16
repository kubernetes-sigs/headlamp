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

import { Icon, InlineIcon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { Theme } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { SxProps } from '@mui/system';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { getTablesRowsPerPage, setTablesRowsPerPage } from '../../helpers/tablesRowsPerPage';
import { useURLState } from '../../lib/util';
import { useSettings } from '../App/Settings/hook';
import Empty from './EmptyContent';
import Loader from './Loader';

type sortFunction = (arg1: any, arg2: any) => number;
type getterFunction = (arg: any) => any;

interface SimpleTableColumn {
  label: string;
  header?: React.ReactNode;
  gridTemplate?: number | string;
  cellProps?: {
    [propName: string]: any;
  };
  sort?: sortFunction | getterFunction | boolean;
}

export interface SimpleTableDatumColumn extends SimpleTableColumn {
  datum: string;
}

export interface SimpleTableGetterColumn extends SimpleTableColumn {
  getter: (...args: any[]) => void;
}

export interface SimpleTableProps {
  columns: (SimpleTableGetterColumn | SimpleTableDatumColumn)[];
  data:
    | {
        [dataProp: string]: any;
        [dataProp: number]: any;
      }[]
    | null
    | undefined;
  filterFunction?: ((...args: any[]) => boolean) | null;
  rowsPerPage?: number[];
  emptyMessage?: string;
  errorMessage?: string | null;
  defaultSortingColumn?: number;
  noTableHeader?: boolean;
  /** Whether to reflect the page/perPage properties in the URL.
   * If assigned to a string, it will be the prefix for the page/perPage parameters.
   * If true or '', it'll reflect the parameters without a prefix.
   * By default, no parameters are reflected in the URL. */
  reflectInURL?: string | boolean;
  /** The page number to show by default (by default it's the first page). */
  page?: number;
  /** Whether to show the pagination component */
  showPagination?: boolean;
  /** The style for the table */
  className?: string;
  sx?: SxProps<Theme>;
}

interface ColumnSortButtonProps {
  isDefaultSorted: boolean;
  isIncreasingOrder: boolean;
  clickHandler: (isIncreasingOrder: boolean) => void;
}

function ColumnSortButtons(props: ColumnSortButtonProps) {
  const { t } = useTranslation();
  const { isDefaultSorted, isIncreasingOrder, clickHandler } = props;
  return isDefaultSorted ? (
    <IconButton
      aria-label={isIncreasingOrder ? t('translation|sort up') : t('translation|sort down')}
      size="small"
      onClick={() => clickHandler(!isIncreasingOrder)}
    >
      <Icon icon={isIncreasingOrder ? 'mdi:menu-up' : 'mdi:menu-down'} />
    </IconButton>
  ) : (
    <IconButton
      aria-label={t('translation|sort swap')}
      size="small"
      onClick={() => clickHandler(true)}
    >
      <Icon icon="mdi:menu-swap" />
    </IconButton>
  );
}

// Use a zero-indexed "useURLState" hook, so pages are shown in the URL as 1-indexed
// but internally are 0-indexed.
function usePageURLState(
  key: string,
  prefix: string,
  initialPage: number
): ReturnType<typeof useURLState> {
  const [page, setPage] = useURLState(key, { defaultValue: initialPage + 1, prefix });
  const [zeroIndexPage, setZeroIndexPage] = React.useState(page - 1);

  React.useEffect(() => {
    setZeroIndexPage((zeroIndexPage: number) => {
      if (page - 1 !== zeroIndexPage) {
        return page - 1;
      }

      return zeroIndexPage;
    });
  }, [page]);

  React.useEffect(() => {
    setPage(zeroIndexPage + 1);
  }, [zeroIndexPage]);

  return [zeroIndexPage, setZeroIndexPage];
}

export default function SimpleTable(props: SimpleTableProps) {
  const {
    columns,
    data,
    filterFunction = null,
    emptyMessage = null,
    page: initialPage = 0,
    // @todo: This is a workaround due to how the pagination is built by default.
    showPagination = !import.meta.env.UNDER_TEST, // Disable for snapshots: The pagination uses useId so snapshots will fail.
    errorMessage = null,
    defaultSortingColumn,
    noTableHeader = false,
    reflectInURL,
    className,
    sx,
  } = props;
  const shouldReflectInURL = reflectInURL !== undefined && reflectInURL !== false;
  const prefix = reflectInURL === true ? '' : reflectInURL || '';
  const [page, setPage] = usePageURLState(shouldReflectInURL ? 'p' : '', prefix, initialPage);
  const [currentData, setCurrentData] = React.useState(data);
  const [displayData, setDisplayData] = React.useState(data);
  const storeRowsPerPageOptions = useSettings('tableRowsPerPageOptions');
  const rowsPerPageOptions = props.rowsPerPage || storeRowsPerPageOptions;
  const defaultRowsPerPage = React.useMemo(() => getTablesRowsPerPage(rowsPerPageOptions[0]), []);
  const [rowsPerPage, setRowsPerPage] = useURLState(shouldReflectInURL ? 'perPage' : '', {
    defaultValue: defaultRowsPerPage,
    prefix,
  });
  const gridTemplateColumns = React.useMemo(() => {
    const columnsTemplates = columns.map(column => column.gridTemplate || 1);
    const templates: string[] = [];
    columnsTemplates.forEach(template => {
      if (typeof template === 'number') {
        templates.push(`${template}fr`);
      } else if (typeof template === 'string') {
        templates.push(template);
      }
    });

    return templates.join(' ');
  }, [columns]);
  const [isIncreasingOrder, setIsIncreasingOrder] = React.useState(
    !defaultSortingColumn || defaultSortingColumn > 0
  );
  // We use a -1 value here if no sorting should be done by default.
  const [sortColIndex, setSortColIndex] = React.useState(
    defaultSortingColumn ? Math.abs(defaultSortingColumn) - 1 : -1
  );
  const { t } = useTranslation();

  function handleChangePage(_event: any, newPage: number) {
    setPage(newPage);
  }

  // Protect against invalid page values
  React.useEffect(() => {
    if (page < 0) {
      setPage(0);
      return;
    }

    if (displayData && page * rowsPerPage > displayData.length) {
      setPage(Math.floor(displayData.length / rowsPerPage));
    }
  }, [page, displayData, rowsPerPage]);

  function handleChangeRowsPerPage(
    event: React.ChangeEvent<HTMLTextAreaElement> | React.ChangeEvent<HTMLInputElement>
  ) {
    const numRows = +event.target.value;
    setTablesRowsPerPage(numRows);
    setRowsPerPage(numRows);
    setPage(0);
  }

  React.useEffect(
    () => {
      if (currentData === data) {
        return;
      }

      // If the currentData is not up to date and we are in the first page, then update
      // it directly. Otherwise it will require user's intervention.
      if (!currentData || currentData.length === 0 || page === 0) {
        setCurrentData(data);
        setDisplayData(getSortData() || data);
      }
    },
    // eslint-disable-next-line
    [data, currentData]
  );

  function defaultSortingFunction(column: SimpleTableDatumColumn | SimpleTableGetterColumn) {
    const sort = column?.sort;
    function defaultSortingReal(item1: any, item2: any) {
      let getterFunc = (column as SimpleTableGetterColumn).getter;
      if (!!sort && typeof sort === 'function') {
        getterFunc = sort;
      }
      // If instead of a getter function, we have a datum, then we use it to fetch the values for
      // comparison.
      const datum = (column as SimpleTableDatumColumn).datum;
      if (!getterFunc && !!datum) {
        getterFunc = (item: any) => item[datum];
      }
      const value1 = getterFunc(item1);
      const value2 = getterFunc(item2);

      let compareValue = 0;
      if (value1 < value2) {
        compareValue = -1;
      } else if (value1 > value2) {
        compareValue = 1;
      }

      return compareValue * (isIncreasingOrder ? 1 : -1);
    }

    return defaultSortingReal;
  }

  function getSortData() {
    if (!data || sortColIndex < 0) {
      return null;
    }
    let applySort = undefined;
    const columnAskingForSort = columns[sortColIndex];
    const sortFunction = columnAskingForSort?.sort;

    if (
      (typeof sortFunction === 'boolean' && sortFunction) ||
      (typeof sortFunction === 'function' && sortFunction.length === 1)
    ) {
      setDisplayData(data.slice().sort(defaultSortingFunction(columnAskingForSort)));
      return;
    }

    if (typeof sortFunction === 'function') {
      applySort = (arg1: any, arg2: any) => {
        const orderChanger = isIncreasingOrder ? 1 : -1;
        return (sortFunction(arg1, arg2) as number) * orderChanger;
      };
      const sortedData = data.slice().sort(applySort);
      return sortedData;
    }
  }

  React.useEffect(
    () => {
      const sortedData = getSortData();
      if (!sortedData) {
        return;
      }
      setDisplayData(sortedData);
    },
    // eslint-disable-next-line
    [sortColIndex, isIncreasingOrder, currentData]
  );

  function getPagedRows() {
    const startIndex = page * rowsPerPage;
    return filteredData!.slice(startIndex, startIndex + rowsPerPage);
  }

  if (displayData === null) {
    if (!!errorMessage) {
      return <Empty color="error">{errorMessage}</Empty>;
    }

    return <Loader title={t('Loading table data')} />;
  }

  let filteredData = displayData;
  if (filterFunction) {
    filteredData = displayData?.filter(filterFunction);
  }

  if (
    (filteredData?.length === 0 || (filteredData?.length ?? 0) < page * rowsPerPage) &&
    page !== 0
  ) {
    setPage(0);
  }

  function sortClickHandler(isIncreasingOrder: boolean, index: number) {
    setIsIncreasingOrder(isIncreasingOrder);
    setSortColIndex(index);
  }

  return !currentData || currentData.length === 0 ? (
    <Paper variant="outlined">
      <Empty>{emptyMessage || t('No data to be shown.')}</Empty>
    </Paper>
  ) : (
    <TableContainer
      className={className}
      sx={{
        overflowY: 'hidden',
        ...sx,
      }}
      component={Paper}
      variant="outlined"
      tabIndex={0}
    >
      {
        // Show a refresh button if the data is not up to date, so we allow the user to keep
        // reading the current data without "losing" it or being sent to the first page
        currentData !== data && page !== 0 && (
          <Box textAlign="center" p={2}>
            <Button
              variant="contained"
              startIcon={<Icon icon="mdi:refresh" />}
              onClick={() => {
                setCurrentData(data);
                setPage(0);
              }}
            >
              {t('translation|Refresh')}
            </Button>
          </Box>
        )
      }
      <Table
        sx={theme => ({
          minWidth: '100%',
          width: 'auto',
          display: 'grid',
          gridTemplateColumns: gridTemplateColumns || '1fr',
          background: theme.palette.background.default,
          [theme.breakpoints.down('sm')]: {
            overflowX: 'auto', // make it responsive
          },
          '& .MuiTableCell-root': {
            borderColor: theme.palette.divider,
            padding: '8px 16px 7px 16px',
            [theme.breakpoints.down('sm')]: {
              padding: '15px 24px 15px 16px',
            },
            overflow: 'hidden',
            width: '100%',
            wordWrap: 'break-word',
          },
          '& .MuiTableBody-root': {
            '& .MuiTableRow-root:last-child': {
              '& .MuiTableCell-root': {
                borderBottom: 'none',
              },
            },
          },
          '& .MuiTableCell-head': {
            overflow: 'hidden',
            textOverflow: 'unset',
            whiteSpace: 'nowrap',
            color: theme.palette.tables.head.text,
            background: theme.palette.background.muted,
            width: '100%',
            minWidth: 'max-content',
          },
          '& .MuiTableHead-root, & .MuiTableRow-root, & .MuiTableBody-root': {
            display: 'contents',
          },
        })}
        size="small"
      >
        {!noTableHeader && (
          <TableHead>
            <TableRow>
              {columns.map(({ label, header, cellProps = {}, sort }, i) => {
                const { className = '', ...otherProps } = cellProps;
                return (
                  <TableCell
                    key={`tabletitle_${i}`}
                    className={className}
                    sx={theme => ({
                      fontWeight: 'bold',
                      paddingBottom: theme.spacing(0.5),
                      ...(sort ? { whiteSpace: 'nowrap' } : {}),
                    })}
                    {...otherProps}
                  >
                    {header || label}
                    {sort && (
                      <ColumnSortButtons
                        isIncreasingOrder={Boolean(isIncreasingOrder)}
                        isDefaultSorted={sortColIndex === i}
                        clickHandler={(isIncreasingOrder: boolean) =>
                          sortClickHandler(isIncreasingOrder, i)
                        }
                      />
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
        )}
        <TableBody>
          {filteredData!.length > 0 ? (
            getPagedRows().map((row: any, i: number) => (
              <TableRow key={i}>
                {columns.map((col, i) => {
                  const { cellProps = {} } = col;
                  return (
                    <TableCell key={`cell_${i}`} {...cellProps}>
                      {i === 0 && row.color && (
                        <React.Fragment>
                          <InlineIcon icon="mdi:square" color={row.color} height="15" width="15" />
                          &nbsp;
                        </React.Fragment>
                      )}
                      {'datum' in col ? row[col.datum] : col.getter(row)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell style={{ gridColumn: `span ${columns.length}` }}>
                <Empty>{t('No data matching the filter criteria.')}</Empty>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {filteredData!.length > rowsPerPageOptions[0] && showPagination && (
        <TablePagination
          rowsPerPageOptions={rowsPerPageOptions}
          component="div"
          count={filteredData!.length}
          rowsPerPage={rowsPerPage}
          showFirstButton
          showLastButton
          page={page}
          backIconButtonProps={{
            'aria-label': 'previous page',
          }}
          nextIconButtonProps={{
            'aria-label': 'next page',
          }}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      )}
    </TableContainer>
  );
}

// For legacy reasons.
export * from './NameValueTable';
