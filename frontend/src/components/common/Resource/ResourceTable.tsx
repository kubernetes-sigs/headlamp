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

import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import { TableCellProps } from '@mui/material/TableCell';
import {
  MRT_FilterFns,
  MRT_Row,
  MRT_SortingFn,
  MRT_SortingState,
  MRT_TableInstance,
  MRT_VisibilityState,
} from 'material-react-table';
import {
  ComponentProps,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { loadTableSettings, storeTableSettings } from '../../../helpers/tableSettings';
import { useSelectedClusters } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { KubeObjectClass } from '../../../lib/k8s/KubeObject';
import { useFilterFunc } from '../../../lib/util';
import { DefaultHeaderAction, RowAction } from '../../../redux/actionButtonsSlice';
import { useNamespaces } from '../../../redux/filterSlice';
import { HeadlampEventType, useEventCallback } from '../../../redux/headlampEventSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { useSettings } from '../../App/Settings/hook';
import { ClusterGroupErrorMessage } from '../../cluster/ClusterGroupErrorMessage';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import { DateLabel } from '../Label';
import Link from '../Link';
import Table, { TableColumn } from '../Table';
import DeleteButton from './DeleteButton';
import EditButton from './EditButton';
import ResourceTableMultiActions from './ResourceTableMultiActions';
import { RestartButton } from './RestartButton';
import ScaleButton from './ScaleButton';
import ViewButton from './ViewButton';

export type ResourceTableColumn<RowItem> = {
  /** Unique id for the column, not required but recommended */
  id?: string;
  /** Show or hide the column @default true */
  show?: boolean;
  /** Label of the column that will be shown in the header */
  label: string;
  cellProps?: TableCellProps & {
    [propName: string]: any;
  };
  /**
   * By default the column will be sorted by the value provided in the getter
   * but you can provide your own sorting function here
   *
   * @default true
   **/
  sort?: boolean | ((a: RowItem, b: RowItem) => number);
  /** Change how filtering behaves, by default it will just search the text value */
  filterVariant?: TableColumn<any>['filterVariant'];
  disableFiltering?: boolean;
  /**
   * Column width in the grid template format
   * Number values will be converted to "fr"
   * @example
   * 1
   * "1.5fr"
   * "min-content"
   */
  gridTemplate?: string | number;
  /** Options for the select filter */
  filterSelectOptions?: TableColumn<any>['filterSelectOptions'];
} & (
  | {
      /** To render a simple value provide property name of the item */
      datum: keyof RowItem;
      render?: never;
      getValue?: never;
    }
  | {
      datum?: never;
      /** How to render a cell */
      render?: (item: RowItem) => ReactNode;
      /** Plain value for filtering and sorting. This is going to be displayed unless render property is defined */
      getValue: (item: RowItem) => string | number | null | undefined;
    }
  | {
      datum?: never;
      render?: never;
      /** @deprecated please use getValue and render (optional, if you need custom renderer) */
      getter: (item: RowItem) => any;
    }
);

export type ColumnType = 'age' | 'name' | 'namespace' | 'type' | 'kind' | 'cluster';

/**
 * Default column ID to use for sorting when no explicit default is provided.
 */
const DEFAULT_SORT_COLUMN_ID = 'age';

/**
 * Maximum length for generated table IDs to avoid overly long localStorage keys.
 */
const MAX_TABLE_ID_LENGTH = 50;

export interface ResourceTableProps<RowItem> {
  /** The columns to be rendered, like used in Table, or by name. */
  columns: (ResourceTableColumn<RowItem> | ColumnType)[];
  /** Show or hide row actions @default false*/
  enableRowActions?: boolean;
  /** Show or hide row selections and actions @default false*/
  enableRowSelection?: boolean;
  actions?: null | RowAction[];
  /** Provide a list of columns that won't be shown and cannot be turned on */
  hideColumns?: string[] | null;
  /** ID for the table. Will be used by plugins to identify this table.
   * Official tables in Headlamp will have the 'headlamp-' prefix for their IDs which is followed by the resource's plural name or the section in Headlamp the table is in.
   * Plugins should use their own prefix when creating tables, to avoid any clashes.
   */
  id?: string;
  /** Deny plugins to process this table's columns. */
  noProcessing?: boolean;
  /** The callback for when the columns chooser is closed. */
  onColumnChooserClose?: () => void;
  /** Specify initial sorting of the table, provide id of the column you want the table to be sorted by and direction */
  defaultSortingColumn?: { id: string; desc: boolean };
  /** Apply a global search filter by default. Table will use all columns to search */
  defaultGlobalFilter?: string;
  /** Rows data */
  data: Array<RowItem> | null;
  /** Filter out rows from the table */
  filterFunction?: (item: RowItem) => boolean;
  /** Display an error message. Table will be hidden even if data is present */
  errorMessage?: string | null;
  /** Display an errors */
  errors?: ApiError[] | null;
  /** State of the Table (page, rows per page) is reflected in the url */
  reflectInURL?: string | boolean;
}

export interface ResourceTableFromResourceClassProps<KubeClass extends KubeObjectClass>
  extends Omit<ResourceTableProps<InstanceType<KubeClass>>, 'data'> {
  resourceClass: KubeClass;
  namespaces?: string[];
}

export default function ResourceTable<KubeClass extends KubeObjectClass>(
  props:
    | ResourceTableFromResourceClassProps<KubeClass>
    | ResourceTableProps<InstanceType<KubeClass>>
) {
  if (!!(props as ResourceTableFromResourceClassProps<KubeClass>).resourceClass) {
    const { resourceClass, ...otherProps } =
      props as ResourceTableFromResourceClassProps<KubeClass>;
    return <TableFromResourceClass resourceClass={resourceClass!} {...otherProps} />;
  }

  return <ResourceTableContent {...(props as ResourceTableProps<InstanceType<KubeClass>>)} />;
}

function TableFromResourceClass<KubeClass extends KubeObjectClass>(
  props: ResourceTableFromResourceClassProps<KubeClass>
) {
  const { resourceClass, id, ...otherProps } = props;
  const selectedNamespaces = useNamespaces();
  const { items, errors } = resourceClass.useList({
    namespace: props.namespaces ?? selectedNamespaces,
  });

  // throttle the update of the table to once per second
  const throttledItems = useThrottle(items, 1000);
  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.LIST_VIEW);

  useEffect(() => {
    dispatchHeadlampEvent({
      resources: items!,
      resourceKind: resourceClass.className,
      error: errors?.[0] || undefined,
    });
  }, [items, errors]);

  return (
    <ResourceTableContent
      errors={errors}
      id={id || `headlamp-${resourceClass.pluralName}`}
      {...otherProps}
      data={throttledItems}
    />
  );
}

/**
 * Here we figure out which columns are visible and not visible
 * We can control it using show property in the columns prop {@link ResourceTableColumn}
 * And when user manually changes visibility it is saved to localStorage
 */
function initColumnVisibilityState(columns: ResourceTableProps<any>['columns'], tableId?: string) {
  const visibility: Record<string, boolean> = {};

  // Apply default visibility we got from the props
  columns.forEach((col, index) => {
    if (typeof col === 'string') return;

    if ('show' in col) {
      visibility[col.id ?? String(index)] = col.show ?? true;
    }
  });

  // Load and apply persisted settings from local storage
  if (tableId) {
    const localTableSettins = loadTableSettings(tableId);
    localTableSettins.forEach(({ id, show }) => (visibility[id] = show));
  }

  return visibility;
}

// By default MRT passes row object to the sorting function but we only need the original item
function sortingFn(sortFn?: (a: any, b: any) => number): MRT_SortingFn<any> | undefined {
  if (!sortFn) return undefined;

  return (a: any, b: any) => sortFn(a.original, b.original);
}

/**
 * Returns a throttled version of the input value.
 *
 * @param value - The value to be throttled.
 * @param interval - The interval in milliseconds to throttle the value.
 * @returns The throttled value.
 */
export function useThrottle(value: any, interval = 1000): any {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastEffected = useRef(Date.now() + interval);

  // Ensure we don't throttle holding the loading null or undefined value before
  // real data comes in. Otherwise we could wait up to interval milliseconds
  // before we update the throttled value.
  //
  //   numEffected == 0,  null, or undefined whilst loading.
  //   numEffected == 1,  real data.
  const numEffected = useRef(0);

  useEffect(() => {
    const now = Date.now();

    if (now >= lastEffected.current + interval || numEffected.current < 2) {
      numEffected.current = numEffected.current + 1;
      lastEffected.current = now;
      setThrottledValue(value);
    } else {
      const id = window.setTimeout(() => {
        lastEffected.current = now;
        setThrottledValue(value);
      }, interval);

      return () => window.clearTimeout(id);
    }
  }, [value, interval]);

  return throttledValue;
}

function ResourceTableContent<RowItem extends KubeObject>(props: ResourceTableProps<RowItem>) {
  const {
    columns,
    defaultSortingColumn,
    id,
    noProcessing = false,
    hideColumns = [],
    filterFunction,
    errorMessage,
    reflectInURL,
    data,
    defaultGlobalFilter,
    actions,
    enableRowActions = false,
    enableRowSelection = false,
    errors,
  } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const theme = useTheme();
  const storeRowsPerPageOptions = useSettings('tableRowsPerPageOptions');
  const clusters = useSelectedClusters();
  const tableProcessors = useTypedSelector(state => state.resourceTable.tableColumnsProcessors);
  const defaultFilterFunc = useFilterFunc();
  const [columnVisibility, setColumnVisibility] = useState(() =>
    initColumnVisibilityState(columns, id)
  );

  // Generate a stable table ID for sorting state persistence
  // This ensures each table has unique sorting state even without explicit id
  const tableId = useMemo(() => {
    if (id) return id;

    // Create a stable fallback ID based on component props
    const columnIds = columns
      .map((col, index) => {
        if (typeof col === 'string') return col;
        return col.id || col.label || `col-${index}`;
      })
      .join('-');

    return `table-${columnIds.slice(0, MAX_TABLE_ID_LENGTH)}`; // Limit length to avoid overly long keys
  }, [id, columns]);

  const [sorting, setSorting] = useLocalStorageState<MRT_SortingState>(
    `table_sorting.${tableId}`,
    // Initial sorting state
    defaultSortingColumn
      ? // If default sorting column is provided, use that
        [defaultSortingColumn]
      : // Otherwise fallback to age column, if it exists
      columns.find(it => typeof it === 'string' && it === DEFAULT_SORT_COLUMN_ID)
      ? [{ id: DEFAULT_SORT_COLUMN_ID, desc: false }]
      : []
  );

  const [tableSettings] = useState<{ id: string; show: boolean }[]>(
    !!id ? loadTableSettings(id) : []
  );

  const [allColumns] = useMemo(() => {
    let processedColumns = columns;

    if (!noProcessing) {
      tableProcessors.forEach(processorInfo => {
        console.debug('Processing columns with processor: ', processorInfo.id, '...');
        processedColumns =
          processorInfo.processor({ id: id || '', columns: processedColumns }) || [];
      });
    }
    function removeClusterColIfNeeded(cols: typeof columns) {
      return cols.filter(col => clusters.length > 1 || col !== 'cluster');
    }

    const allColumns = removeClusterColIfNeeded(processedColumns)
      .map((col, index): TableColumn<RowItem> => {
        const indexId = String(index);

        if (typeof col !== 'string') {
          const column = col as ResourceTableColumn<RowItem>;

          const sort = column.sort ?? true;

          const mrtColumn: TableColumn<RowItem> = {
            id: column.id ?? indexId,
            header: column.label,
            filterVariant: column.filterVariant,
            enableMultiSort: !!sort,
            enableSorting: !!sort,
            enableColumnFilter: !column.disableFiltering,
            muiTableBodyCellProps: {
              ...column.cellProps,
              // Make sure column don't override width, it'll mess up the layout
              // the layout is controlled only through the gridTemplate property
              sx: { ...(column.cellProps?.sx ?? {}), width: 'unset', minWidth: 'unset' },
            },
            gridTemplate: column.gridTemplate ?? 1,
            filterSelectOptions: column.filterSelectOptions,
          };

          if ('getValue' in column) {
            mrtColumn.accessorFn = item => column.getValue?.(item) ?? '';
          } else if ('getter' in column) {
            mrtColumn.accessorFn = column.getter;
          } else {
            mrtColumn.accessorFn = (item: RowItem) => item[column.datum];
          }
          if ('render' in column) {
            mrtColumn.Cell = ({ row }: { row: MRT_Row<RowItem> }) =>
              column.render?.(row.original) ?? null;
          }
          if (sort && typeof sort === 'function') {
            mrtColumn.sortingFn = sortingFn(sort);
          }

          return mrtColumn;
        }

        switch (col) {
          case 'name':
            return {
              id: 'name',
              header: t('translation|Name'),
              gridTemplate: 'auto',
              accessorFn: (item: RowItem) => item.metadata.name,
              Cell: ({ row }: { row: MRT_Row<RowItem> }) =>
                row.original && <Link kubeObject={row.original} />,
            };
          case 'age':
            return {
              id: 'age',
              header: t('translation|Age'),
              gridTemplate: 'min-content',
              accessorFn: (item: RowItem) => -new Date(item.metadata.creationTimestamp).getTime(),
              enableColumnFilter: false,
              muiTableBodyCellProps: {
                align: 'right',
              },
              Cell: ({ row }: { row: MRT_Row<RowItem> }) =>
                row.original && (
                  <DateLabel
                    date={row.original.metadata.creationTimestamp}
                    format="mini"
                    iconProps={{ color: theme.palette.text.primary }}
                  />
                ),
            };
          case 'namespace':
            return {
              id: 'namespace',
              header: t('glossary|Namespace'),
              gridTemplate: 'auto',
              accessorFn: (item: RowItem) => item.getNamespace() ?? '-',
              filterVariant: 'multi-select',
              Cell: ({ row }: { row: MRT_Row<RowItem> }) =>
                row.original?.getNamespace() ? (
                  <Link
                    routeName="namespace"
                    params={{
                      name: row.original.getNamespace(),
                    }}
                    activeCluster={row.original.cluster}
                  >
                    {row.original.getNamespace()}
                  </Link>
                ) : (
                  ''
                ),
            };
          case 'cluster':
            return {
              id: 'cluster',
              header: t('glossary|Cluster'),
              gridTemplate: 'min-content',
              Cell: ({ row }: { row: MRT_Row<RowItem> }) => (
                <Box sx={{ whiteSpace: 'nowrap' }}>{row.original.cluster}</Box>
              ),
              accessorFn: (resource: KubeObject) => resource.cluster,
            };
          case 'type':
          case 'kind':
            return {
              id: 'kind',
              header: t('translation|Kind'),
              accessorFn: (resource: RowItem) => String(resource?.kind),
              filterVariant: 'multi-select',
              gridTemplate: 'min-content',
            };
          default:
            throw new Error(`Unknown column: ${col}`);
        }
      })
      .filter(col => !hideColumns?.includes(col.id ?? '')) as Array<
      TableColumn<RowItem> & { gridTemplate?: string | number }
    >;

    return [allColumns];
  }, [
    columns,
    hideColumns,
    id,
    noProcessing,
    defaultSortingColumn,
    tableProcessors,
    tableSettings,
    sorting,
  ]);

  const defaultActions: RowAction[] = [
    {
      id: DefaultHeaderAction.RESTART,
      action: ({ item }) => <RestartButton item={item} buttonStyle="menu" key="restart" />,
    },
    {
      id: DefaultHeaderAction.SCALE,
      action: ({ item }) => <ScaleButton item={item} buttonStyle="menu" key="scale" />,
    },
    {
      id: DefaultHeaderAction.EDIT,
      action: ({ item, closeMenu }) => (
        <EditButton item={item} buttonStyle="menu" afterConfirm={closeMenu} key="edit" />
      ),
    },
    {
      id: DefaultHeaderAction.VIEW,
      action: ({ item }) => <ViewButton item={item} buttonStyle="menu" key="view" />,
    },
    {
      id: DefaultHeaderAction.DELETE,
      action: ({ item, closeMenu }) => (
        <DeleteButton item={item} buttonStyle="menu" afterConfirm={closeMenu} key="delete" />
      ),
    },
  ];
  let hAccs: RowAction[] = [];
  if (actions !== undefined && actions !== null) {
    hAccs = actions;
  }

  const actionsProcessed: RowAction[] = [...hAccs, ...defaultActions];

  const renderRowActionMenuItems = useMemo(() => {
    if (actionsProcessed.length === 0) {
      return undefined;
    }
    return ({ closeMenu, row }: { closeMenu: () => void; row: MRT_Row<RowItem> }) => {
      return actionsProcessed.map(action => {
        if (action.action === undefined || action.action === null) {
          return <MenuItem key={action.id || 'empty'} />;
        }
        return action.action({ item: row.original, closeMenu });
      });
    };
  }, [actionsProcessed]);

  const wrappedEnableRowSelection = useMemo(() => {
    if (import.meta.env.REACT_APP_HEADLAMP_ENABLE_ROW_SELECTION === 'false') {
      return false;
    }
    return enableRowSelection;
  }, [enableRowSelection]);

  const renderRowSelectionToolbar = useMemo(() => {
    if (!wrappedEnableRowSelection) {
      return undefined;
    }
    return ({ table }: { table: MRT_TableInstance<RowItem> }) => (
      <ResourceTableMultiActions table={table} />
    );
  }, [wrappedEnableRowSelection]);

  function onColumnsVisibilityChange(
    updater: MRT_VisibilityState | ((old: MRT_VisibilityState) => MRT_VisibilityState)
  ): void {
    setColumnVisibility(oldCols => {
      const newCols = typeof updater === 'function' ? updater(oldCols) : updater;

      if (!!id) {
        const colsToStore = Object.entries(newCols).map(([id, show]) => ({
          id,
          show: (show ?? true) as boolean,
        }));
        storeTableSettings(id, colsToStore);
      }

      return newCols;
    });
  }

  const initialState: ComponentProps<typeof Table<RowItem>>['initialState'] = {};

  if (defaultGlobalFilter) {
    initialState.globalFilter = defaultGlobalFilter;
    initialState.showGlobalFilter = true;
  }

  const handleSortingChange = useCallback(
    (updaterOrValue: MRT_SortingState | ((old: MRT_SortingState) => MRT_SortingState)) => {
      setSorting(old => {
        if (typeof updaterOrValue === 'function') {
          return updaterOrValue(old);
        }
        return updaterOrValue;
      });
    },
    [setSorting]
  );

  const filterFunc = filterFunction ?? defaultFilterFunc;

  return (
    <>
      <ClusterGroupErrorMessage errors={errors} />
      <Table<RowItem>
        enableFullScreenToggle={false}
        enableFacetedValues
        enableRowSelection={wrappedEnableRowSelection}
        renderRowSelectionToolbar={renderRowSelectionToolbar}
        errorMessage={errorMessage}
        columns={allColumns as TableColumn<RowItem>[]}
        data={(data ?? []) as Array<RowItem>}
        loading={data === null}
        initialState={initialState}
        rowsPerPage={storeRowsPerPageOptions}
        state={{
          columnVisibility,
          sorting,
        }}
        reflectInURL={reflectInURL}
        onColumnVisibilityChange={onColumnsVisibilityChange}
        onSortingChange={handleSortingChange}
        enableRowActions={enableRowActions}
        renderRowActionMenuItems={renderRowActionMenuItems}
        filterFns={{
          kubeObjectSearch: (row, id, filterValue) => {
            const customFilterResult = filterFunc(row.original, filterValue);
            const fuzzyColumnsResult = MRT_FilterFns.contains(row, id, filterValue);
            return customFilterResult || fuzzyColumnsResult;
          },
        }}
        globalFilterFn="kubeObjectSearch"
        filterFunction={filterFunc}
        getRowId={item => item?.metadata?.uid}
      />
    </>
  );
}
