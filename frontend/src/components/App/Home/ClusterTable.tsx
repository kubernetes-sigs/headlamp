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
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  MRT_ColumnFiltersState,
  MRT_ExpandedState,
  MRT_SortingState,
  MRT_Updater,
  MRT_VisibilityState,
} from 'material-react-table';
import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router-dom';
import { getClusterAppearanceFromMeta } from '../../../helpers/clusterAppearance';
import {
  ClusterLabels,
  collectClusterLabelOptions,
  formatClusterLabel,
  matchesClusterLabelFilters,
  parseClusterLabelFilter,
} from '../../../helpers/clusterLabels';
import { isElectron } from '../../../helpers/isElectron';
import { setRecentCluster } from '../../../helpers/recentClusters';
import { loadTableSettings, storeTableSettings } from '../../../helpers/tableSettings';
import { formatClusterPathParam } from '../../../lib/cluster';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { Cluster } from '../../../lib/k8s/cluster';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { getClusterPrefixedPath } from '../../../lib/util';
import { useTypedSelector } from '../../../redux/hooks';
import { Loader } from '../../common';
import Link from '../../common/Link';
import Table from '../../common/Table';
import { LightTooltip } from '../../common/Tooltip';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import ClusterBadge from '../../Sidebar/ClusterBadge';
import ClusterContextMenu from './ClusterContextMenu';
import {
  getClusterStatusAccessor,
  getClusterStatusInfo,
  getConditionTooltip,
  isClusterInventoryCluster,
  STATUS_VARIANTS,
} from './ClusterInventory';
import { canSelectCluster } from './clusterStatus';
import { CONNECT_ON_CLUSTER_LINK, MULTI_HOME_ENABLED } from './config';
import { getCustomClusterNames } from './customClusterNames';
import RegisteredClusterEmptyState from './RegisteredClusterEmptyState';
import { useClusterLabels } from './useClusterLabels';

/**
 * ClusterStatus component displays the status of a cluster.
 * It shows an icon and a message indicating whether the cluster is active, loading, unavailable,
 * requires authentication, has insufficient permissions, or has an unhealthy control plane.
 *
 * @param {Object} props - The component props.
 * @param {ApiError|null} [props.error] - The error object if there is an error with the cluster.
 */
function ClusterStatus({
  error,
  cluster,
  isConnected,
  onConnect,
}: {
  error?: ApiError | null;
  cluster: Cluster;
  /** Whether the cluster is in the auto-connect set (i.e. being polled). */
  isConnected: boolean;
  /** Connect to the cluster on demand so its status is loaded. */
  onConnect: (clusterName: string) => void;
}) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();
  const customStatuses = useTypedSelector(state => state.clusterProvider.clusterStatuses);
  const renderedCustomStatus = useMemo(() => {
    for (const Status of customStatuses) {
      const renderedStatus = <Status cluster={cluster} error={error} />;
      if (renderedStatus !== null) {
        return renderedStatus;
      }
    }
    return null;
  }, [customStatuses, cluster, error]);

  if (renderedCustomStatus !== null) {
    return renderedCustomStatus;
  }

  // Not in the auto-connect set and not yet contacted: show an explicit
  // "not connected" state with a connect action instead of the ambiguous "⋯".
  if (!isConnected && error === undefined) {
    return (
      <LightTooltip title={t('translation|Not connected. Connect to load this cluster.')}>
        <Box display="flex" alignItems="center" justifyContent="center" width="fit-content">
          <Icon icon="mdi:cloud-off-outline" width={16} color={theme.palette.text.secondary} />
          <Button
            size="small"
            onClick={() => onConnect(cluster.name)}
            sx={{ ml: 0.5, textTransform: 'none' }}
          >
            {t('translation|Connect')}
          </Button>
        </Box>
      </LightTooltip>
    );
  }

  // Connected but no response yet: show a connecting indicator rather than the
  // ambiguous "⋯".
  if (isConnected && error === undefined) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" width="fit-content">
        <CircularProgress size={14} />
        <Typography variant="body2" sx={{ ml: 1, color: theme.palette.text.secondary }}>
          {t('translation|Connecting…')}
        </Typography>
      </Box>
    );
  }

  const { kind, text, condition } = getClusterStatusInfo(cluster, error, t);
  const variant = STATUS_VARIANTS[kind];
  const color = theme.palette.home.status[variant.colorKey];
  const tooltip = condition ? getConditionTooltip(condition) : '';
  const statusContent = (
    <Box display="flex" alignItems="center" justifyContent="center" width="fit-content">
      <Icon icon={variant.icon} width={16} color={color} />
      <Typography
        variant="body2"
        style={{
          marginLeft: theme.spacing(1),
          color: variant.coloredText ? color : undefined,
        }}
      >
        {text}
      </Typography>
    </Box>
  );

  return tooltip ? (
    <LightTooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tooltip}</span>}>
      {statusContent}
    </LightTooltip>
  ) : (
    statusContent
  );
}

export interface ClusterTableProps {
  /** Some clusters have custom names. */
  customNameClusters: ReturnType<typeof getCustomClusterNames>;
  /** Versions for each cluster. */
  versions: ReturnType<typeof useClustersVersion>[0];
  /** Errors for each cluster. */
  errors: ReturnType<typeof useClustersVersion>[1];
  /** Clusters configuration. */
  clusters: ReturnType<typeof useClustersConf>;
  /** Warnings for each cluster. */
  warningLabels: { [cluster: string]: string };
  /**
   * Names of clusters that are currently being connected to / polled. When
   * omitted, all clusters are treated as connected (no "Not connected" state).
   */
  connectedClusterNames?: Set<string>;
  /** Connect to a cluster on demand (adds it to the auto-connect set). */
  onConnectCluster?: (clusterName: string) => void;
}

/**
 * ClusterTable component displays a table of clusters with their status, origin, and version.
 */
const CLUSTER_TABLE_ID = 'home-clusters';
/** Hidden column whose value is the cluster's value for the label key being grouped by. */
const LABEL_GROUP_COLUMN_ID = 'labelGroup';
/** Group value of clusters without the grouped label; not a valid label value, so it can't clash. */
const UNGROUPED_VALUE = '<ungrouped>';

/** The id MRT gives the row heading a group. */
function getGroupRowId(groupValue: string) {
  return `${LABEL_GROUP_COLUMN_ID}:${groupValue}`;
}

/** Orders group values alphabetically, with the ungrouped clusters last. */
function compareGroupValues(a: string, b: string) {
  if (a === b) {
    return 0;
  }
  if (a === UNGROUPED_VALUE) {
    return 1;
  }
  if (b === UNGROUPED_VALUE) {
    return -1;
  }
  return a.localeCompare(b);
}

/** Labels shown as chips; clicking one filters the table by that label. */
function ClusterLabelChips({
  labels,
  onSelect,
}: {
  labels: ClusterLabels;
  onSelect: (label: string) => void;
}) {
  const { t } = useTranslation(['translation']);
  const texts = Object.entries(labels)
    .map(([key, value]) => formatClusterLabel(key, value))
    .sort((a, b) => a.localeCompare(b));

  return (
    <Box display="flex" flexWrap="wrap" gap={0.5}>
      {texts.map(text => (
        <Chip
          key={text}
          label={text}
          size="small"
          variant="outlined"
          onClick={() => onSelect(text)}
          aria-label={t('translation|Filter by {{ label }}', { label: text })}
        />
      ))}
    </Box>
  );
}

export default function ClusterTable({
  customNameClusters,
  versions,
  errors,
  clusters,
  warningLabels,
  connectedClusterNames,
  onConnectCluster,
}: ClusterTableProps) {
  const history = useHistory();
  const { t } = useTranslation(['translation']);

  const isClusterConnected = (clusterName: string) =>
    connectedClusterNames ? connectedClusterNames.has(clusterName) : true;

  const [columnVisibility, setColumnVisibility] = useState<MRT_VisibilityState>(() => {
    const visibility: Record<string, boolean> = {};
    const stored = loadTableSettings(CLUSTER_TABLE_ID);
    stored.forEach(({ id, show }) => (visibility[id] = show));
    return visibility;
  });

  const [sorting, setSorting] = useLocalStorageState<MRT_SortingState>(
    `table_sorting.${CLUSTER_TABLE_ID}`,
    [{ id: 'name', desc: false }]
  );

  const [columnFilters, setColumnFilters] = useLocalStorageState<MRT_ColumnFiltersState>(
    `table_filters.${CLUSTER_TABLE_ID}`,
    []
  );

  const handleColumnVisibilityChange = useCallback(
    (updater: MRT_VisibilityState | ((old: MRT_VisibilityState) => MRT_VisibilityState)) => {
      setColumnVisibility(oldCols => {
        const newCols = typeof updater === 'function' ? updater(oldCols) : updater;
        const colsToStore = Object.entries(newCols).map(([id, show]) => ({
          id,
          show: (show ?? true) as boolean,
        }));
        storeTableSettings(CLUSTER_TABLE_ID, colsToStore);
        return newCols;
      });
    },
    []
  );

  const handleSortingChange = useCallback(
    (updater: MRT_SortingState | ((old: MRT_SortingState) => MRT_SortingState)) => {
      setSorting(old => (typeof updater === 'function' ? updater(old) : updater));
    },
    [setSorting]
  );

  const handleColumnFiltersChange = useCallback(
    (
      updater: MRT_ColumnFiltersState | ((old: MRT_ColumnFiltersState) => MRT_ColumnFiltersState)
    ) => {
      setColumnFilters(old => (typeof updater === 'function' ? updater(old) : updater));
    },
    [setColumnFilters]
  );

  const clusterNames = useMemo(
    () => (customNameClusters || []).map(cluster => cluster.name),
    [customNameClusters]
  );
  const labelsByCluster = useClusterLabels(clusterNames);
  const labelOptions = useMemo(
    () => collectClusterLabelOptions(labelsByCluster),
    [labelsByCluster]
  );
  const hasLabels = labelOptions.keys.length > 0;

  const [storedGroupBy, setStoredGroupBy] = useLocalStorageState<string>(
    `table_group_by.${CLUSTER_TABLE_ID}`,
    ''
  );
  const [groupMenuAnchor, setGroupMenuAnchor] = useState<HTMLElement | null>(null);
  const groupButtonId = useId();
  const groupMenuId = `${groupButtonId}-menu`;
  const [collapsedGroups, setCollapsedGroups] = useLocalStorageState<Record<string, string[]>>(
    `table_collapsed_groups.${CLUSTER_TABLE_ID}`,
    {}
  );

  const groupBy = labelOptions.keys.includes(storedGroupBy) ? storedGroupBy : '';
  // The Labels column is hidden by default without labels, so its standard column filter
  // must not keep hiding clusters out of sight either.
  const effectiveColumnFilters = useMemo(() => {
    const filters = Array.isArray(columnFilters) ? columnFilters : [];
    return hasLabels ? filters : filters.filter(filter => filter.id !== 'labels');
  }, [columnFilters, hasLabels]);
  const hasLabelFilter = effectiveColumnFilters.some(
    filter => filter.id === 'labels' && !!filter.value
  );
  const exactLabelSelector = useMemo(() => {
    const value = effectiveColumnFilters.find(filter => filter.id === 'labels')?.value;
    return typeof value === 'string' ? parseClusterLabelFilter(value) : null;
  }, [effectiveColumnFilters]);
  const filterByExactLabelSelector = useCallback(
    (cluster: Cluster) =>
      !exactLabelSelector ||
      matchesClusterLabelFilters(labelsByCluster[cluster.name] ?? {}, [exactLabelSelector]),
    [exactLabelSelector, labelsByCluster]
  );

  const addLabelFilter = useCallback(
    (text: string) =>
      setColumnFilters(old => {
        const current = Array.isArray(old) ? old : [];
        const currentLabelFilter = current.find(filter => filter.id === 'labels');
        if (currentLabelFilter?.value === text) {
          return current.filter(filter => filter.id !== 'labels');
        }
        return [...current.filter(filter => filter.id !== 'labels'), { id: 'labels', value: text }];
      }),
    [setColumnFilters]
  );

  const getGroupValue = useCallback(
    (cluster: Cluster) => {
      const labels = labelsByCluster[cluster.name] ?? {};
      return Object.prototype.hasOwnProperty.call(labels, groupBy)
        ? labels[groupBy]
        : UNGROUPED_VALUE;
    },
    [labelsByCluster, groupBy]
  );

  // Groups are listed in the order they first appear in the data, so sort it by group.
  // The table caches cell values per row and rebuilds rows only when the data changes,
  // so the data must also change with the status, warnings, versions and labels that the
  // cells show, or they would keep showing what they first loaded with.
  const tableData = useMemo(() => {
    const list = Object.values(customNameClusters || []);
    if (!groupBy) {
      return list;
    }
    return [...list].sort((a, b) => compareGroupValues(getGroupValue(a), getGroupValue(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customNameClusters,
    groupBy,
    getGroupValue,
    versions,
    errors,
    warningLabels,
    connectedClusterNames,
    labelsByCluster,
  ]);

  const groupValues = useMemo(
    () => (groupBy ? [...new Set(tableData.map(getGroupValue))] : []),
    [groupBy, tableData, getGroupValue]
  );

  const collapsedForGroupBy = useMemo(() => {
    const collapsed = groupBy && collapsedGroups ? collapsedGroups[groupBy] : undefined;
    return Array.isArray(collapsed) ? collapsed : [];
  }, [collapsedGroups, groupBy]);

  const expanded = useMemo<Record<string, boolean>>(
    () =>
      Object.fromEntries(
        groupValues.map(value => [getGroupRowId(value), !collapsedForGroupBy.includes(value)])
      ),
    [groupValues, collapsedForGroupBy]
  );

  const handleExpandedChange = useCallback(
    (updater: MRT_Updater<MRT_ExpandedState>) => {
      const next = typeof updater === 'function' ? updater(expanded) : updater;
      const isExpanded = (value: string) =>
        next === true || !!(next as Record<string, boolean>)[getGroupRowId(value)];
      setCollapsedGroups(old => {
        const previous = old && Array.isArray(old[groupBy]) ? old[groupBy] : [];
        // Keep collapsed groups that are filtered out right now.
        const hidden = previous.filter(value => !groupValues.includes(value));
        const collapsed = [...hidden, ...groupValues.filter(value => !isExpanded(value))];
        return { ...(old || {}), [groupBy]: collapsed };
      });
    },
    [expanded, groupBy, groupValues, setCollapsedGroups]
  );

  /**
   * Gets the origin of a cluster.
   *
   * @param cluster
   * @returns A description of where the cluster is picked up from: dynamic, in-cluster, or from a kubeconfig file.
   */
  function getOrigin(cluster: Cluster): string {
    if (cluster?.meta_data?.source === 'kubeconfig') {
      const sourcePath = cluster?.meta_data?.origin?.kubeconfig;
      return sourcePath ? `Kubeconfig: ${sourcePath}` : 'Kubeconfig';
    } else if (cluster?.meta_data?.source === 'dynamic_cluster') {
      return t('translation|Plugin');
    } else if (cluster?.meta_data?.source === 'incluster') {
      return t('translation|In-cluster');
    } else if (isClusterInventoryCluster(cluster)) {
      return t('translation|Cluster Inventory');
    }
    return t('translation|Unknown');
  }

  const viewClusters = t('View Clusters');

  const loading = clusters === null;
  if (loading) {
    return <Loader title={t('Loading...')} />;
  }

  const clustersList = Object.values(customNameClusters);
  if (clustersList.length === 0) {
    const defaultContent = (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="400px"
        textAlign="center"
      >
        <Icon
          icon="mdi:hexagon-multiple-outline"
          style={{ fontSize: 64, color: '#ccc', marginBottom: 16 }}
        />
        <Typography variant="h6" gutterBottom>
          {t('No clusters found')}
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t('Add a cluster to get started.')}
        </Typography>
        {isElectron() && (
          <Button
            variant="contained"
            startIcon={<Icon icon="mdi:plus" />}
            onClick={() => {
              history.push(createRouteURL('addCluster'));
            }}
          >
            {t('Add Cluster')}
          </Button>
        )}
      </Box>
    );
    return <RegisteredClusterEmptyState defaultContent={defaultContent} />;
  }

  const table = (
    <Table
      columns={[
        {
          id: 'name',
          header: t('Name'),
          accessorKey: 'name',
          gridTemplate: 2,
          Cell: ({ row: { original } }) => {
            const appearance = getClusterAppearanceFromMeta(original.name);
            return (
              <LightTooltip title={original.name}>
                {/* Record as recently-used on open so it auto-connects on return.
                    onClickCapture on the wrapper keeps the Link's native
                    navigation (and works for keyboard activation) while the Link
                    would disable navigation if given an onClick. */}
                <span
                  onClickCapture={() => {
                    setRecentCluster(original.name);
                    if (CONNECT_ON_CLUSTER_LINK) {
                      onConnectCluster?.(original.name);
                    }
                  }}
                >
                  <Link routeName="cluster" params={{ cluster: original.name }}>
                    <ClusterBadge
                      name={original.name}
                      icon={appearance.icon}
                      accentColor={appearance.accentColor}
                    />
                  </Link>
                </span>
              </LightTooltip>
            );
          },
        },
        {
          id: 'origin',
          header: t('Origin'),
          accessorFn: cluster => getOrigin(cluster),
          Cell: ({ row: { original } }) => (
            <Typography variant="body2">{getOrigin((clusters || {})[original.name])}</Typography>
          ),
        },
        {
          id: 'status',
          header: t('Status'),
          accessorFn: cluster =>
            // When the cluster is not yet connected (no polling), the cell shows
            // "Not connected". Match the accessor so sorting/filtering is consistent.
            !isClusterConnected(cluster?.name) && errors[cluster?.name] === undefined
              ? t('translation|Not connected')
              : getClusterStatusAccessor(cluster, errors[cluster?.name], t),
          Cell: ({ row: { original } }) => (
            <ClusterStatus
              error={errors[original.name]}
              cluster={original}
              isConnected={isClusterConnected(original.name)}
              onConnect={onConnectCluster ?? (() => {})}
            />
          ),
        },
        {
          id: 'warnings',
          header: t('Warnings'),
          // Warnings track connection status: list them for connected clusters
          // (⋯ while loading), blank for clusters that aren't connected.
          accessorFn: cluster =>
            isClusterConnected(cluster?.name) ? warningLabels[cluster?.name] ?? '⋯' : '',
        },
        {
          id: 'version',
          header: t('glossary|Kubernetes Version'),
          accessorFn: ({ name }) =>
            isClusterConnected(name) ? versions[name]?.gitVersion || '⋯' : '',
        },
        {
          id: 'labels',
          header: t('translation|Labels'),
          gridTemplate: 1.5,
          responsivePriority: -1,
          enableHiding: !hasLabelFilter,
          accessorFn: cluster =>
            Object.entries(labelsByCluster[cluster?.name] ?? {})
              .map(([key, value]) => formatClusterLabel(key, value))
              .sort((a, b) => a.localeCompare(b))
              .join(', '),
          Cell: ({ row: { original } }) => (
            <ClusterLabelChips
              labels={labelsByCluster[original.name] ?? {}}
              onSelect={addLabelFilter}
            />
          ),
        },
        {
          id: 'actions',
          header: t('Actions'),
          gridTemplate: 'min-content',
          muiTableBodyCellProps: {
            align: 'right',
          },
          accessorFn: cluster => getClusterStatusAccessor(cluster, errors[cluster?.name], t),
          Cell: ({ row: { original: cluster } }) => {
            return <ClusterContextMenu cluster={cluster} />;
          },
          enableSorting: false,
          enableColumnFilter: false,
        },
        ...(groupBy
          ? [
              {
                id: LABEL_GROUP_COLUMN_ID,
                header: groupBy,
                accessorFn: getGroupValue,
                enableHiding: false,
                visibleInShowHideMenu: false,
                enableSorting: false,
                enableColumnFilter: false,
                enableGlobalFilter: false,
                GroupedCell: ({ row }: { row: { groupingValue?: unknown } }) =>
                  row.groupingValue === UNGROUPED_VALUE
                    ? t('translation|Ungrouped')
                    : formatClusterLabel(groupBy, String(row.groupingValue)),
              },
            ]
          : []),
      ]}
      data={tableData}
      // Selection is keyed by row id, so it must follow the cluster rather than its
      // position, which changes when filtering or grouping. The prefix keeps ids apart
      // from group row ids and from inherited object properties such as "constructor".
      getRowId={cluster => `cluster:${cluster.name}`}
      filterFunction={filterByExactLabelSelector}
      enableGrouping={!!groupBy}
      renderAdditionalToolbarActions={() =>
        hasLabels ? (
          <>
            <Tooltip
              title={
                groupBy
                  ? `${t('translation|Group by label')}: ${groupBy}`
                  : t('translation|Group by label')
              }
            >
              <IconButton
                id={groupButtonId}
                aria-label={t('translation|Group by label')}
                aria-haspopup="menu"
                aria-expanded={!!groupMenuAnchor || undefined}
                aria-controls={groupMenuAnchor ? groupMenuId : undefined}
                aria-pressed={!!groupBy}
                color={groupBy ? 'primary' : 'default'}
                onClick={event => setGroupMenuAnchor(event.currentTarget)}
              >
                <Icon icon="mdi:format-list-group" width={24} />
              </IconButton>
            </Tooltip>
            <Menu
              id={groupMenuId}
              anchorEl={groupMenuAnchor}
              open={!!groupMenuAnchor}
              onClose={() => setGroupMenuAnchor(null)}
              MenuListProps={{ 'aria-labelledby': groupButtonId }}
              disableScrollLock
            >
              <MenuItem
                role="menuitemradio"
                aria-checked={!groupBy}
                selected={!groupBy}
                onClick={() => {
                  setStoredGroupBy('');
                  setGroupMenuAnchor(null);
                }}
              >
                {t('translation|None')}
              </MenuItem>
              {labelOptions.keys.map(key => (
                <MenuItem
                  key={key}
                  role="menuitemradio"
                  aria-checked={groupBy === key}
                  selected={groupBy === key}
                  onClick={() => {
                    setStoredGroupBy(key);
                    setGroupMenuAnchor(null);
                  }}
                >
                  {key}
                </MenuItem>
              ))}
            </Menu>
          </>
        ) : null
      }
      groupedColumnMode="remove"
      onExpandedChange={handleExpandedChange}
      enableRowSelection={
        MULTI_HOME_ENABLED
          ? row => {
              // Only allow selection if the cluster is working
              return canSelectCluster(errors[row.original.name]);
            }
          : false
      }
      state={{
        columnVisibility: {
          // Show the labels column by default once some cluster has labels.
          labels: hasLabels,
          ...columnVisibility,
          ...(hasLabelFilter ? { labels: true } : {}),
          ...(groupBy ? { [LABEL_GROUP_COLUMN_ID]: false } : {}),
        },
        sorting,
        columnFilters: effectiveColumnFilters,
        ...(groupBy ? { grouping: [LABEL_GROUP_COLUMN_ID], expanded } : {}),
      }}
      onColumnVisibilityChange={handleColumnVisibilityChange}
      onSortingChange={handleSortingChange}
      onColumnFiltersChange={handleColumnFiltersChange}
      muiToolbarAlertBannerProps={({ table }) => ({
        sx: theme => ({
          background: theme.palette.background.muted,
          // MRT also opens the banner while grouping, but it only holds the action for the
          // selected clusters, so keep it hidden until some are selected.
          ...(table.getFilteredSelectedRowModel().rows.length === 0 ? { display: 'none' } : {}),
        }),
      })}
      renderToolbarAlertBannerContent={({ table }) => (
        <Button
          variant="contained"
          sx={{
            marginLeft: 1,
          }}
          onClick={() => {
            const selectedClusterNames = table
              .getFilteredSelectedRowModel()
              .rows.map(it => it.original.name);
            // Opening clusters counts as using them; record as recently-used.
            selectedClusterNames.forEach(name => setRecentCluster(name));
            history.push({
              pathname: generatePath(getClusterPrefixedPath(), {
                cluster: formatClusterPathParam(selectedClusterNames),
              }),
            });
          }}
        >
          {viewClusters}
        </Button>
      )}
    />
  );

  return table;
}
