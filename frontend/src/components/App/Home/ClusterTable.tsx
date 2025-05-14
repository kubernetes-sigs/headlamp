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
import { Button, useTheme } from '@mui/material';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { generatePath, useHistory } from 'react-router-dom';
import { formatClusterPathParam } from '../../../lib/cluster';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/apiProxy';
import { Cluster } from '../../../lib/k8s/cluster';
import { getClusterPrefixedPath } from '../../../lib/util';
import { Link, Table } from '../../common';
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
function ClusterStatus({ error }: { error?: ApiError | null }) {
  const { t } = useTranslation(['translation']);
  const theme = useTheme();

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
export default function ClusterTable({
  customNameClusters,
  versions,
  errors,
  clusters,
  warningLabels,
}: ClusterTableProps) {
  const history = useHistory();
  const { t } = useTranslation(['translation']);

  /**
   * Gets the origin of a cluster.
   *
   * @param cluster
   * @returns A description of where the cluster is picked up from: dynamic, in-cluster, or from a kubeconfig file.
   */
  function getOrigin(cluster: Cluster): string {
    if (cluster.meta_data?.source === 'kubeconfig') {
      const kubeconfigPath = process.env.KUBECONFIG ?? '~/.kube/config';
      return `Kubeconfig: ${kubeconfigPath}`;
    } else if (cluster.meta_data?.source === 'dynamic_cluster') {
      return t('translation|Plugin');
    } else if (cluster.meta_data?.source === 'in_cluster') {
      return t('translation|In-cluster');
    }
    return 'Unknown';
  }
  const viewClusters = t('View Clusters');

  return (
    <Table
      columns={[
        {
          id: 'name',
          header: t('Name'),
          accessorKey: 'name',
          Cell: ({ row: { original } }) => (
            <Link routeName="cluster" params={{ cluster: original.name }}>
              {original.name}
            </Link>
          ),
        },
        {
          header: t('Origin'),
          accessorFn: cluster => getOrigin(cluster),
          Cell: ({ row: { original } }) => (
            <Typography variant="body2">{getOrigin((clusters || {})[original.name])}</Typography>
          ),
        },
        {
          header: t('Status'),
          accessorFn: cluster =>
            errors[cluster.name] === null ? 'Active' : errors[cluster.name]?.message,
          Cell: ({ row: { original } }) => <ClusterStatus error={errors[original.name]} />,
        },
        { header: t('Warnings'), accessorFn: cluster => warningLabels[cluster.name] },
        {
          header: t('glossary|Kubernetes Version'),
          accessorFn: ({ name }) => versions[name]?.gitVersion || '⋯',
        },
        {
          header: '',
          muiTableBodyCellProps: {
            align: 'right',
          },
          accessorFn: cluster =>
            errors[cluster.name] === null ? 'Active' : errors[cluster.name]?.message,
          Cell: ({ row: { original: cluster } }) => {
            return <ClusterContextMenu cluster={cluster} />;
          },
        },
      ]}
      data={Object.values(customNameClusters)}
      enableRowSelection={
        MULTI_HOME_ENABLED
          ? row => {
              // Only allow selection if the cluster is working
              return !errors[row.original.name];
            }
          : false
      }
      initialState={{
        sorting: [{ id: 'name', desc: false }],
      }}
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
