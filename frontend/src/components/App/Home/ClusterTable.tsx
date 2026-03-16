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
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  MRT_ColumnFiltersState,
  MRT_SortingState,
  MRT_VisibilityState,
} from 'material-react-table';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router-dom';
import { getClusterAppearanceFromMeta } from '../../../helpers/clusterAppearance';
import { isElectron } from '../../../helpers/isElectron';
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
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import ClusterBadge from '../../Sidebar/ClusterBadge';
import ClusterContextMenu from './ClusterContextMenu';
import { MULTI_HOME_ENABLED } from './config';
import { getCustomClusterNames } from './customClusterNames';

/**
 * ClusterStatus component displays the status of a cluster.
 * It shows an icon and a message indicating whether the cluster is active, unknown, or has an error.
 *
 * @param {Object} props - The component props.
 * @param {ApiError|null} [props.error] - The error object if there is an error with the cluster.
 */
function ClusterStatus({ error, cluster }: { error?: ApiError | null; cluster: Cluster }) {
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

  const stateUnknown = error === undefined;
  const hasReachError = error && error.status !== 401 && error.status !== 403;

  return (
    <Box width="fit-content">
      <Box display="flex" alignItems="center" justifyContent="center">
        {hasReachError ? (
          <Icon icon="mdi:cloud-off" width={16} color={theme.palette.home.status.error} />
        ) : stateUnknown ? (
          <Icon icon="mdi:cloud-question" width={16} color={theme.palette.home.status.unknown} />
        ) : (
          <Icon
            icon="mdi:cloud-check-variant"
            width={16}
            color={theme.palette.home.status.success}
          />
        )}
        <Typography
          variant="body2"
          style={{
            marginLeft: theme.spacing(1),
            color: hasReachError
              ? theme.palette.home.status.error
              : !stateUnknown
              ? theme.palette.home.status.success
              : undefined,
          }}
        >
          {hasReachError ? error.message : stateUnknown ? '⋯' : t('translation|Active')}
        </Typography>
      </Box>
    </Box>
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
}

/**
 * ClusterTable component displays a table of clusters with their status, origin, and version.
 */
const CLUSTER_TABLE_ID = 'home-clusters';

export default function ClusterTable({
  customNameClusters,
  versions,
  errors,
  clusters,
  warningLabels,
}: ClusterTableProps) {
  const history = useHistory();
  const { t } = useTranslation(['translation']);

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
    } else if (cluster?.meta_data?.source === 'in_cluster') {
      return t('translation|In-cluster');
    }
    return 'Unknown';
  }
  const viewClusters = t('View Clusters');

  const loading = clusters === null;
  if (loading) {
    return <Loader title={t('Loading...')} />;
  }

  const clustersList = Object.values(customNameClusters);
  if (clustersList.length === 0) {
    return (
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
  }

  return (
    <Table
      columns={[
        {
          id: 'name',
          header: t('Name'),
          accessorKey: 'name',
          Cell: ({ row: { original } }) => {
            const appearance = getClusterAppearanceFromMeta(original.name);
            return (
              <Link routeName="cluster" params={{ cluster: original.name }}>
                <ClusterBadge
                  name={original.name}
                  icon={appearance.icon}
                  accentColor={appearance.accentColor}
                />
              </Link>
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
            errors[cluster?.name] === null ? 'Active' : errors[cluster?.name]?.message,
          Cell: ({ row: { original } }) => (
            <ClusterStatus error={errors[original.name]} cluster={original} />
          ),
        },
        {
          id: 'warnings',
          header: t('Warnings'),
          accessorFn: cluster => warningLabels[cluster?.name],
        },
        {
          id: 'version',
          header: t('glossary|Kubernetes Version'),
          accessorFn: ({ name }) => versions[name]?.gitVersion || '⋯',
        },
        {
          id: 'actions',
          header: t('Actions'),
          gridTemplate: 'min-content',
          muiTableBodyCellProps: {
            align: 'right',
          },
          accessorFn: cluster =>
            errors[cluster?.name] === null ? 'Active' : errors[cluster?.name]?.message,
          Cell: ({ row: { original: cluster } }) => {
            return <ClusterContextMenu cluster={cluster} />;
          },
          enableSorting: false,
          enableColumnFilter: false,
        },
      ]}
      data={clustersList}
      enableRowSelection={
        MULTI_HOME_ENABLED
          ? row => {
              // Only allow selection if the cluster is working
              return !errors[row.original.name];
            }
          : false
      }
      state={{
        columnVisibility,
        sorting,
        columnFilters,
      }}
      onColumnVisibilityChange={handleColumnVisibilityChange}
      onSortingChange={handleSortingChange}
      onColumnFiltersChange={handleColumnFiltersChange}
      muiToolbarAlertBannerProps={{
        sx: theme => ({
          background: theme.palette.background.muted,
        }),
      }}
      renderToolbarAlertBannerContent={({ table }) => (
        <Button
          variant="contained"
          sx={{
            marginLeft: 1,
          }}
          onClick={() => {
            history.push({
              pathname: generatePath(getClusterPrefixedPath(), {
                cluster: formatClusterPathParam(
                  table.getSelectedRowModel().rows.map(it => it.original.name)
                ),
              }),
            });
          }}
        >
          {viewClusters}
        </Button>
      )}
    />
  );
}
