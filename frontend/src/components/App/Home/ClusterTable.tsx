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
  MRT_TableInstance,
  MRT_Updater,
  MRT_VisibilityState,
} from 'material-react-table';
import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router-dom';
import { getClusterAppearanceFromMeta } from '../../../helpers/clusterAppearance';
import {
  ClusterSourceView,
  createClusterPresentation,
  EMPTY_SOURCE_VIEWS,
  getClusterDisplayName,
  getClusterField,
  getClusterSearchText,
  getClusterSourceLabel,
  translateClusterLabel,
} from '../../../helpers/clusterPresentation';
import {
  ClusterTags,
  collectClusterTagOptions,
  formatClusterTag,
  matchesClusterTagFilters,
  parseClusterTagFilter,
} from '../../../helpers/clusterTags';
import { isElectron } from '../../../helpers/isElectron';
import { setRecentCluster } from '../../../helpers/recentClusters';
import { loadTableSettings, storeTableSettings } from '../../../helpers/tableSettings';
import { formatClusterPathParam } from '../../../lib/cluster';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/api/v2/ApiError';
import { Cluster } from '../../../lib/k8s/cluster';
import { createRouteURL } from '../../../lib/router/createRouteURL';
import { getClusterPrefixedPath } from '../../../lib/util';
import { ClusterStatusComponent } from '../../../redux/clusterProviderSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { Loader } from '../../common';
import ErrorBoundary from '../../common/ErrorBoundary';
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
  STATUS_VARIANTS,
} from './ClusterInventory';
import { canSelectCluster } from './clusterStatus';
import { CONNECT_ON_CLUSTER_LINK, MULTI_HOME_ENABLED } from './config';
import { getCustomClusterNames } from './customClusterNames';
import RegisteredClusterEmptyState from './RegisteredClusterEmptyState';
import { useClusterTags } from './useClusterTags';

// Module-level map so each registered callback gets a stable numeric key that
// is derived from its identity, not from its position in the array.
const statusKeyMap = new WeakMap<ClusterStatusComponent, number>();
let statusKeyCounter = 0;

function getStatusKey(fn: ClusterStatusComponent): string {
  if (!statusKeyMap.has(fn)) {
    statusKeyMap.set(fn, statusKeyCounter++);
  }
  return String(statusKeyMap.get(fn));
}

/**
 * Renders Headlamp's built-in cluster status (the "Active", "Connecting…",
 * "Not connected", or error variant). Extracted so ClusterStatus can use it
 * as the terminal fallback of the callback chain.
 */
function DefaultClusterStatus({
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

interface StatusLinkProps {
  statuses: ClusterStatusComponent[];
  index: number;
  cluster: Cluster;
  error?: ApiError | null;
  fallback: React.ReactElement;
}

/**
 * Renders link `index` of the status callback chain, or the fallback once every
 * callback has been tried.
 *
 * Each link is keyed by the identity of the callback it runs (not its index),
 * so when plugins register more callbacks a link never inherits another
 * callback's hook state. A callback that throws is caught by the link's
 * ErrorBoundary, which renders the next link instead.
 *
 * The rest of the chain is passed on as a single `StatusChain` element, so it
 * is only expanded when React actually renders it: when this link's callback
 * returns null, or when it throws. Each render therefore builds one link per
 * callback tried, not the whole remaining chain at every link.
 */
function StatusChain(props: StatusLinkProps) {
  const { statuses, index, fallback } = props;
  if (index >= statuses.length) {
    return fallback;
  }
  return (
    <ErrorBoundary
      key={getStatusKey(statuses[index])}
      fallback={<StatusChain {...props} index={index + 1} />}
    >
      <ClusterStatusLink {...props} />
    </ErrorBoundary>
  );
}

/**
 * Runs one registered status callback. The callback is called as a function so
 * that a null (or undefined) result can fall through to the next link; a JSX
 * element would never be null. Because each callback runs in its own component
 * instance, callbacks may use hooks.
 */
function ClusterStatusLink(props: StatusLinkProps) {
  const { statuses, index, cluster, error } = props;
  const result = statuses[index]({ cluster, error });
  if (result !== null && result !== undefined) {
    return result;
  }
  return <StatusChain {...props} index={index + 1} />;
}

/**
 * ClusterStatus component displays the status of a cluster.
 * It shows an icon and a message indicating whether the cluster is active, loading, unavailable,
 * requires authentication, has insufficient permissions, or has an unhealthy control plane.
 *
 * @param {Object} props - The component props.
 * @param {ApiError|null} [props.error] - The error object if there is an error with the cluster.
 */
export function ClusterStatus({
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
  const customStatuses = useTypedSelector(state => state.clusterProvider.clusterStatuses);
  const defaultStatus = (
    <DefaultClusterStatus
      cluster={cluster}
      error={error}
      isConnected={isConnected}
      onConnect={onConnect}
    />
  );

  return (
    <StatusChain
      statuses={customStatuses}
      index={0}
      cluster={cluster}
      error={error}
      fallback={defaultStatus}
    />
  );
}

export interface ClusterTableProps {
  /** The source whose tab the table is on. Omitted on the All tab. */
  source?: ClusterSourceView;
  /** Source definitions from the backend config, used to label the source of a cluster. */
  sourceViews?: ClusterSourceView[];
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
/** Hidden column whose value is the cluster's value for the tag key being grouped by. */
const TAG_GROUP_COLUMN_ID = 'tagGroup';
/** Group value of clusters without the grouped label; not a valid label value, so it can't clash. */
const UNGROUPED_VALUE = '<ungrouped>';

/** The id MRT gives the row heading a group. */
function getGroupRowId(groupValue: string) {
  return `${TAG_GROUP_COLUMN_ID}:${groupValue}`;
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

function getVisibleSelectedClusters(table: MRT_TableInstance<Cluster>) {
  return table
    .getRowModel()
    .rows.filter(row => !row.getIsGrouped() && row.getCanSelect() && row.getIsSelected())
    .map(row => row.original);
}

/** Tags shown as chips; clicking one filters the table by that label. */
function ClusterTagChips({
  tags,
  onSelect,
}: {
  tags: ClusterTags;
  onSelect: (label: string) => void;
}) {
  const { t } = useTranslation(['translation']);
  const texts = Object.entries(tags)
    .map(([key, value]) => formatClusterTag(key, value))
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
  source,
  sourceViews = EMPTY_SOURCE_VIEWS,
}: ClusterTableProps) {
  const tableId = source
    ? `${CLUSTER_TABLE_ID}.${encodeURIComponent(source.id)}`
    : CLUSTER_TABLE_ID;
  const history = useHistory();
  const { t } = useTranslation(['translation']);
  const { getLabel } = useMemo(
    () => createClusterPresentation(Object.values(clusters || {}), sourceViews, label => t(label)),
    [clusters, sourceViews, t]
  );

  const isClusterConnected = (clusterName: string) =>
    connectedClusterNames ? connectedClusterNames.has(clusterName) : true;

  const [columnVisibility, setColumnVisibility] = useState<MRT_VisibilityState>(() => {
    const visibility: Record<string, boolean> = {};
    const stored = loadTableSettings(tableId);
    stored.forEach(({ id, show }) => (visibility[id] = show));
    return visibility;
  });

  const [sorting, setSorting] = useLocalStorageState<MRT_SortingState>(`table_sorting.${tableId}`, [
    { id: 'name', desc: false },
  ]);

  const [columnFilters, setColumnFilters] = useLocalStorageState<MRT_ColumnFiltersState>(
    `table_filters.${tableId}`,
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
        storeTableSettings(tableId, colsToStore);
        return newCols;
      });
    },
    [tableId]
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
  const tagsByCluster = useClusterTags(clusterNames, customNameClusters);
  const tagOptions = useMemo(() => collectClusterTagOptions(tagsByCluster), [tagsByCluster]);
  const hasTags = tagOptions.keys.length > 0;

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

  const groupBy = tagOptions.keys.includes(storedGroupBy) ? storedGroupBy : '';
  // The Tags column is hidden by default without tags, so its standard column filter
  // must not keep hiding clusters out of sight either.
  const effectiveColumnFilters = useMemo(() => {
    const filters = Array.isArray(columnFilters) ? columnFilters : [];
    return hasTags ? filters : filters.filter(filter => filter.id !== 'tags');
  }, [columnFilters, hasTags]);
  const hasLabelFilter = effectiveColumnFilters.some(
    filter => filter.id === 'tags' && !!filter.value
  );
  const exactLabelSelector = useMemo(() => {
    const value = effectiveColumnFilters.find(filter => filter.id === 'tags')?.value;
    return typeof value === 'string' ? parseClusterTagFilter(value) : null;
  }, [effectiveColumnFilters]);
  const filterByExactLabelSelector = useCallback(
    (cluster: Cluster) =>
      !exactLabelSelector ||
      matchesClusterTagFilters(tagsByCluster[cluster.name] ?? {}, [exactLabelSelector]),
    [exactLabelSelector, tagsByCluster]
  );

  const addLabelFilter = useCallback(
    (text: string) =>
      handleColumnFiltersChange(old => {
        const current = Array.isArray(old) ? old : [];
        const currentLabelFilter = current.find(filter => filter.id === 'tags');
        if (currentLabelFilter?.value === text) {
          return current.filter(filter => filter.id !== 'tags');
        }
        return [...current.filter(filter => filter.id !== 'tags'), { id: 'tags', value: text }];
      }),
    [handleColumnFiltersChange]
  );

  const getGroupValue = useCallback(
    (cluster: Cluster) => {
      const tags = tagsByCluster[cluster.name] ?? {};
      return Object.prototype.hasOwnProperty.call(tags, groupBy) ? tags[groupBy] : UNGROUPED_VALUE;
    },
    [tagsByCluster, groupBy]
  );

  // Groups are listed in the order they first appear in the data, so sort it by group.
  // The table caches cell values per row and rebuilds rows only when the data changes,
  // so the data must also change with the status, warnings, versions and tags that the
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
    tagsByCluster,
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
    const label = translateClusterLabel(getClusterSourceLabel(cluster, sourceViews), t);
    const path =
      cluster.meta_data?.source === 'kubeconfig' ? cluster.meta_data?.origin?.kubeconfig : '';
    return path ? `${label}: ${path}` : label;
  }

  function getNameSecondary(cluster: Cluster): string {
    const label = getLabel(cluster);
    return source ? label.disambiguator : label.secondary;
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
          {source
            ? t('No clusters found in {{source}}', {
                source: translateClusterLabel(source.label, t),
              })
            : t('No clusters found')}
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          {source
            ? t('No connections are available from this source.')
            : t('Add a cluster to get started.')}
        </Typography>
        {!source && isElectron() && (
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
    return source ? (
      defaultContent
    ) : (
      <RegisteredClusterEmptyState defaultContent={defaultContent} />
    );
  }

  const table = (
    <Table
      key={tableId}
      columns={[
        {
          id: 'name',
          header: source ? translateClusterLabel(source.nameLabel, t) : t('Name'),
          // The value is the text the cell shows, so memoized cells update with the label.
          accessorFn: cluster =>
            [getClusterDisplayName(cluster), getNameSecondary(cluster)].filter(Boolean).join(' · '),
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
                      name={getClusterDisplayName(original)}
                      secondary={getNameSecondary(original)}
                      icon={appearance.icon}
                      accentColor={appearance.accentColor}
                    />
                  </Link>
                </span>
              </LightTooltip>
            );
          },
        },
        ...(source?.columns?.length
          ? source.columns.map(column => ({
              id: `field.${column.key}`,
              header: translateClusterLabel(column.label, t),
              accessorFn: (cluster: Cluster) => getClusterField(cluster, column.key),
              Cell: ({ row: { original } }: { row: { original: Cluster } }) => (
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {getClusterField(original, column.key) || '—'}
                </Typography>
              ),
            }))
          : [
              {
                id: 'origin',
                header: t('Origin'),
                accessorFn: (cluster: Cluster) => getOrigin(cluster),
                Cell: ({ row: { original } }: { row: { original: Cluster } }) => (
                  <Typography variant="body2">{getOrigin(original)}</Typography>
                ),
              },
            ]),
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
          id: 'tags',
          header: t('translation|Tags'),
          gridTemplate: 1.5,
          responsivePriority: -1,
          enableHiding: !hasLabelFilter,
          accessorFn: cluster =>
            Object.entries(tagsByCluster[cluster?.name] ?? {})
              .map(([key, value]) => formatClusterTag(key, value))
              .sort((a, b) => a.localeCompare(b))
              .join(', '),
          Cell: ({ row: { original } }) => (
            <ClusterTagChips tags={tagsByCluster[original.name] ?? {}} onSelect={addLabelFilter} />
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
                id: TAG_GROUP_COLUMN_ID,
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
                    : formatClusterTag(groupBy, String(row.groupingValue)),
              },
            ]
          : []),
      ]}
      data={tableData}
      getRowId={cluster => `cluster:${cluster.name}`}
      filterFunction={filterByExactLabelSelector}
      filterFns={{
        clusterPresentation: (row, columnId, value) =>
          [row.getValue(columnId), getClusterSearchText(row.original, sourceViews)]
            .join(' ')
            .toLowerCase()
            .includes(String(value).toLowerCase()),
      }}
      globalFilterFn="clusterPresentation"
      enableGrouping={!!groupBy}
      renderAdditionalToolbarActions={() =>
        hasTags ? (
          <>
            <Tooltip
              title={
                groupBy
                  ? `${t('translation|Group by tag')}: ${groupBy}`
                  : t('translation|Group by tag')
              }
            >
              <IconButton
                id={groupButtonId}
                aria-label={t('translation|Group by tag')}
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
              {tagOptions.keys.map(key => (
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
          // Show the tags column by default once some cluster has tags.
          tags: hasTags,
          ...columnVisibility,
          ...(hasLabelFilter ? { tags: true } : {}),
          ...(groupBy ? { [TAG_GROUP_COLUMN_ID]: false } : {}),
        },
        sorting,
        columnFilters: effectiveColumnFilters,
        ...(groupBy ? { grouping: [TAG_GROUP_COLUMN_ID], expanded } : {}),
      }}
      onColumnVisibilityChange={handleColumnVisibilityChange}
      onSortingChange={handleSortingChange}
      onColumnFiltersChange={handleColumnFiltersChange}
      muiToolbarAlertBannerProps={({ table }) => ({
        sx: theme => ({
          background: theme.palette.background.muted,
          // MRT also opens the banner while grouping. Only show it for rows that can
          // currently be acted on in the visible portion of the table.
          ...(getVisibleSelectedClusters(table).length === 0 ? { display: 'none' } : {}),
        }),
      })}
      renderToolbarAlertBannerContent={({ table }) => (
        <Button
          variant="contained"
          sx={{
            marginLeft: 1,
          }}
          onClick={() => {
            const selectedClusterNames = getVisibleSelectedClusters(table).map(it => it.name);
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
