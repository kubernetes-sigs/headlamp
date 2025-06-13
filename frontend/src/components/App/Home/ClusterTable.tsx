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
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { generatePath, useHistory } from 'react-router-dom';
import { formatClusterPathParam } from '../../../lib/cluster';
import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { ApiError } from '../../../lib/k8s/apiProxy';
import { deleteCluster } from '../../../lib/k8s/apiProxy';
import { Cluster } from '../../../lib/k8s/cluster';
import { getClusterPrefixedPath } from '../../../lib/util';
import { setConfig } from '../../../redux/configSlice';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import Link from '../../common/Link';
import Table from '../../common/Table';
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
  const dispatch = useDispatch();
  const [openConfirmDialog, setOpenConfirmDialog] = React.useState<string | null>(null);
  const [selectedClusters, setSelectedClusters] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [snackbar, setSnackbar] = React.useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  /**
   * Gets the origin of a cluster.
   *
   * @param cluster
   * @returns A description of where the cluster is picked up from: dynamic, in-cluster, or from a kubeconfig file.
   */
  function getOrigin(cluster: Cluster): string {
    if (cluster.meta_data?.source === 'kubeconfig') {
      const sourcePath = cluster.meta_data?.origin?.kubeconfig;
      return sourcePath ? `Kubeconfig: ${sourcePath}` : 'Kubeconfig';
    } else if (cluster.meta_data?.source === 'dynamic_cluster') {
      return t('translation|Plugin');
    } else if (cluster.meta_data?.source === 'in_cluster') {
      return t('translation|In-cluster');
    }
    return 'Unknown';
  }

  // Update selected clusters when row selection changes
  const handleRowSelection = (table: any) => {
    const selected = table.getSelectedRowModel().rows.map((row: any) => row.original.name);
    setSelectedClusters(selected);
  };

  function handleSnackbarClose() {
    setSnackbar({ ...snackbar, open: false });
  }

  // Bulk remove function
  const bulkRemoveClusters = () => {
    setIsLoading(true);
    Promise.all(selectedClusters.map(name => deleteCluster(name)))
      .then(configs => {
        // Update config with the last returned config
        dispatch(setConfig(configs[configs.length - 1]));
        setSnackbar({
          open: true,
          message: t('translation|Successfully removed {{count}} clusters', {
            count: selectedClusters.length,
          }),
          severity: 'success',
        });
      })
      .catch(err => {
        console.error('Error removing clusters:', err);
        setSnackbar({
          open: true,
          message: t('translation|Failed to remove clusters: {{error}}', {
            error: err.message,
          }),
          severity: 'error',
        });
      })
      .finally(() => {
        setIsLoading(false);
        setOpenConfirmDialog(null);
        history.push('/');
      });
  };

  const viewClusters = t('View Clusters');

  return (
    <>
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
            id: 'actions',
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
          <Box
            display="flex"
            alignItems="center"
            gap={1}
            sx={{
              padding: theme => theme.spacing(1),
              width: '100%',
            }}
          >
            <Button
              variant="contained"
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
            {table.getSelectedRowModel().rows.length > 0 && (
              <Tooltip
                title={t('translation|Remove selected cluster contexts from ~/.kube/config')}
              >
                <Box position="relative">
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => {
                      handleRowSelection(table);
                      setOpenConfirmDialog('bulkRemove');
                    }}
                    disabled={isLoading}
                  >
                    {t('translation|Remove Selected Clusters')}
                  </Button>
                  {isLoading && (
                    <CircularProgress
                      size={24}
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        marginTop: '-12px',
                        marginLeft: '-12px',
                      }}
                    />
                  )}
                </Box>
              </Tooltip>
            )}
          </Box>
        )}
      />
      <ConfirmDialog
        open={openConfirmDialog === 'bulkRemove'}
        handleClose={() => setOpenConfirmDialog(null)}
        onConfirm={() => {
          bulkRemoveClusters();
        }}
        title={t('translation|Remove Selected Clusters')}
        description={t(
          'translation|Are you sure you want to remove the selected cluster contexts ({{ clusterNames }}) from ~/.kube/config? This will not delete the actual clusters.',
          {
            clusterNames: selectedClusters.join(', '),
          }
        )}
      />
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleSnackbarClose} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
