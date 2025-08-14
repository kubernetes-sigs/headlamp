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
import { Box, DialogContentText } from '@mui/material';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useHistory } from 'react-router-dom';
import helpers from '../../../helpers';
import { deleteCluster } from '../../../lib/k8s/apiProxy';
import { Cluster } from '../../../lib/k8s/cluster';
import { createRouteURL } from '../../../lib/router';
import { useId } from '../../../lib/util';
import { setConfig } from '../../../redux/configSlice';
import { useTypedSelector } from '../../../redux/hooks';
import { ConfirmDialog } from '../../common/ConfirmDialog';
import ErrorBoundary from '../../common/ErrorBoundary/ErrorBoundary';

interface ClusterContextMenuProps {
  /** The cluster for the context menu to act on. */
  cluster: Cluster;
}

/**
 * ClusterContextMenu component displays a context menu for a given cluster.
 */
export default function ClusterContextMenu({ cluster }: ClusterContextMenuProps) {
  const { t } = useTranslation(['translation']);
  const history = useHistory();
  const dispatch = useDispatch();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [snackbar, setSnackbar] = React.useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const menuId = useId('context-menu');
  const [openConfirmDialog, setOpenConfirmDialog] = React.useState<string | null>(null);
  const dialogs = useTypedSelector(state => state.clusterProvider.dialogs);
  const menuItems = useTypedSelector(state => state.clusterProvider.menuItems);

  const kubeconfigOrigin = cluster.meta_data?.origin?.kubeconfig;
  const deleteFromKubeconfig = cluster.meta_data?.source === 'kubeconfig';

  function removeCluster(cluster: Cluster, isPermanentDelete: boolean = false) {
    setIsLoading(true);
    const clusterID = cluster.meta_data?.clusterID;
    const originalName = cluster.meta_data?.originalName ?? '';
    const clusterName = cluster.name;

    deleteCluster(
      clusterName,
      isPermanentDelete ? deleteFromKubeconfig : true,
      clusterID,
      kubeconfigOrigin,
      originalName
    )
      .then(config => {
        dispatch(setConfig(config));
        setSnackbar({
          open: true,
          message: t(
            isPermanentDelete
              ? 'translation|Cluster "{{ clusterName }}" deleted successfully'
              : 'translation|Cluster "{{ clusterName }}" removed successfully',
            { clusterName: cluster.name }
          ),
          severity: 'success',
        });
      })
      .catch((err: Error) => {
        setSnackbar({
          open: true,
          message: t(
            isPermanentDelete
              ? 'translation|Failed to delete cluster "{{ clusterName }}": {{ error }}'
              : 'translation|Failed to remove cluster "{{ clusterName }}": {{ error }}',
            { clusterName: cluster.name, error: err.message }
          ),
          severity: 'error',
        });
      })
      .finally(() => {
        setIsLoading(false);
        history.push('/');
      });
  }

  function removeClusterDescription(cluster: Cluster, isPermanentDelete: boolean = false) {
    if (isPermanentDelete) {
      const description = deleteFromKubeconfig
        ? t('translation|This action will remove cluster "{{ clusterName }}" from "{{ source }}"', {
            clusterName: cluster.name,
            source: kubeconfigOrigin,
          })
        : t('translation|This action will remove cluster "{{ clusterName }}".', {
            clusterName: cluster.name,
          });

      const removeFromKubeconfigDes = deleteFromKubeconfig
        ? t('translation|This action cannot be undone! Do you want to proceed?')
        : t('translation|Delete this cluster?');

      return (
        <>
          {description}
          {removeFromKubeconfigDes && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                marginTop: '1rem',
                marginBottom: '1rem',
              }}
            >
              <DialogContentText id="alert-dialog-description">
                {removeFromKubeconfigDes}
              </DialogContentText>
            </Box>
          )}
        </>
      );
    } else {
      return t(
        'translation|Are you sure you want to remove the cluster context "{{ clusterName }}" from ~/.kube/config? This will not delete the actual cluster.',
        { clusterName: cluster.name }
      );
    }
  }

  function handleMenuClose() {
    setAnchorEl(null);
  }

  function handleSnackbarClose() {
    setSnackbar({ ...snackbar, open: false });
  }

  return (
    <>
      <Tooltip title={t('Actions')}>
        <IconButton
          size="small"
          onClick={event => {
            setAnchorEl(event.currentTarget);
          }}
          aria-haspopup="menu"
          aria-controls={menuId}
          aria-label={t('Actions')}
          disabled={isLoading}
        >
          {isLoading ? <CircularProgress size={24} /> : <Icon icon="mdi:more-vert" />}
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => {
          handleMenuClose();
        }}
      >
        <MenuItem
          onClick={() => {
            history.push(createRouteURL('cluster', { cluster: cluster.name }));
            handleMenuClose();
          }}
        >
          <ListItemText>{t('translation|View')}</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            history.push(createRouteURL('settingsCluster', { cluster: cluster.name }));
            handleMenuClose();
          }}
        >
          <ListItemText>{t('translation|Settings')}</ListItemText>
        </MenuItem>
        {helpers.isElectron() &&
          (cluster.meta_data?.source === 'dynamic_cluster' ||
            cluster.meta_data?.source === 'kubeconfig') && (
            <MenuItem
              onClick={() => {
                setOpenConfirmDialog('deleteDynamic');
                handleMenuClose();
              }}
            >
              <ListItemText>{t('translation|Delete')}</ListItemText>
            </MenuItem>
          )}
        {helpers.isElectron() && (
          <Tooltip title={t('translation|Remove cluster context from ~/.kube/config')}>
            <MenuItem
              onClick={() => {
                setOpenConfirmDialog('removeCluster');
                handleMenuClose();
              }}
            >
              <ListItemText>{t('translation|Remove')}</ListItemText>
            </MenuItem>
          </Tooltip>
        )}
        {menuItems.map((Item, index) => {
          return (
            <Item
              cluster={cluster}
              setOpenConfirmDialog={setOpenConfirmDialog}
              handleMenuClose={handleMenuClose}
              key={index}
            />
          );
        })}
      </Menu>
      <ConfirmDialog
        open={openConfirmDialog === 'removeCluster'}
        handleClose={() => setOpenConfirmDialog('')}
        onConfirm={() => {
          setOpenConfirmDialog('');
          removeCluster(cluster, false);
        }}
        title={t('translation|Remove Cluster')}
        description={removeClusterDescription(cluster, false)}
      />
      <ConfirmDialog
        open={openConfirmDialog === 'deleteDynamic'}
        handleClose={() => setOpenConfirmDialog('')}
        confirmLabel={t('translation|Delete')}
        onConfirm={() => {
          setOpenConfirmDialog('');
          removeCluster(cluster, true);
        }}
        title={t('translation|Delete Cluster')}
        description={removeClusterDescription(cluster, true)}
      />
      {openConfirmDialog !== null &&
        dialogs.map((Dialog, index) => {
          return (
            <ErrorBoundary>
              <Dialog
                cluster={cluster}
                openConfirmDialog={openConfirmDialog}
                setOpenConfirmDialog={setOpenConfirmDialog}
                key={index}
              />
            </ErrorBoundary>
          );
        })}
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
