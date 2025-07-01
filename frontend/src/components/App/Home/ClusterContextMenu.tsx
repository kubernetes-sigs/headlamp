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
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
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
  const menuId = useId('context-menu');
  const [openConfirmDialog, setOpenConfirmDialog] = React.useState<string | null>(null);
  const dialogs = useTypedSelector(state => state.clusterProvider.dialogs);
  const menuItems = useTypedSelector(state => state.clusterProvider.menuItems);

  const kubeconfigOrigin = cluster.meta_data?.origin?.kubeconfig;
  const deleteFromKubeconfig = cluster.meta_data?.source === 'kubeconfig';

  function removeCluster(cluster: Cluster) {
    const clusterID = cluster.meta_data?.clusterID;
    const originalName = cluster.meta_data?.originalName ?? '';
    const clusterName = cluster.name;

    deleteCluster(clusterName, deleteFromKubeconfig, clusterID, kubeconfigOrigin, originalName)
      .then(config => {
        dispatch(setConfig(config));
      })
      .catch((err: Error) => {
        if (err.message === 'Not Found') {
          // TODO: create notification with error message
        }
      })
      .finally(() => {
        history.push('/');
      });
  }

  function removeClusterDescription(cluster: Cluster) {
    const description = deleteFromKubeconfig
      ? t('translation|This action will delete cluster "{{ clusterName }}" from "{{ source }}"', {
          clusterName: cluster.name,
          source: kubeconfigOrigin,
        })
      : t('translation|This action will remove cluster "{{ clusterName }}".', {
          clusterName: cluster.name,
        });

    const removeFromKubeconfigDes = deleteFromKubeconfig
      ? t('translation|This action cannot be undone! Do you want to proceed?')
      : t('translation|Remove this cluster?');

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
  }

  function handleMenuClose() {
    setAnchorEl(null);
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
        >
          <Icon icon="mdi:more-vert" />
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
        open={openConfirmDialog === 'deleteDynamic'}
        handleClose={() => setOpenConfirmDialog('')}
        confirmLabel={t('translation|Delete')}
        onConfirm={() => {
          setOpenConfirmDialog('');
          removeCluster(cluster);
        }}
        title={t('translation|Delete Cluster')}
        description={removeClusterDescription(cluster)}
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
    </>
  );
}
