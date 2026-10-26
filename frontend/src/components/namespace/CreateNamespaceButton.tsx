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
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import { useQueries } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useSelectedClusters } from '../../lib/k8s';
import Namespace from '../../lib/k8s/namespace';
import { clusterAction } from '../../redux/clusterActionSlice';
import { EventStatus, HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { AppDispatch } from '../../redux/stores/store';
import ActionButton from '../common/ActionButton';

export default function CreateNamespaceButton() {
  const { t } = useTranslation(['glossary', 'translation']);
  const [namespaceName, setNamespaceName] = useState('');
  const [namespaceDialogOpen, setNamespaceDialogOpen] = useState(false);
  const [namespaceExistsError, setNamespaceExistsError] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState('');
  const dispatchCreateEvent = useEventCallback(HeadlampEventType.CREATE_RESOURCE);
  const dispatch: AppDispatch = useDispatch();
  const selectedClusters = useSelectedClusters();
  // Outside of a cluster route there are no selected clusters; keep using the default one.
  const clusters = selectedClusters.length > 0 ? selectedClusters : [''];

  const authResults = useQueries({
    queries: clusters.map(cluster => ({
      queryKey: ['namespaceCreateAuth', cluster],
      queryFn: async () => {
        try {
          const res = await Namespace.getAuthorization('create', {}, cluster || undefined);
          return !!res?.status?.allowed;
        } catch {
          return false;
        }
      },
    })),
  });
  const allowedClusters = clusters.filter((_, index) => authResults[index].data === true);
  const targetCluster = allowedClusters.includes(selectedCluster)
    ? selectedCluster
    : allowedClusters[0] ?? '';

  function createNewNamespace() {
    const clusterData = targetCluster;
    const newNamespaceData = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespaceName,
      },
    };

    const newNamespaceName = newNamespaceData.metadata.name;
    // Name the cluster in the messages when it is ambiguous which one was used.
    const newNamespaceLabel =
      selectedClusters.length > 1 ? `${newNamespaceName} (${clusterData})` : newNamespaceName;

    async function namespaceRequest() {
      try {
        const response = await Namespace.apiEndpoint.post(newNamespaceData, {}, clusterData || '');
        setNamespaceName('');
        return response;
      } catch (error: any) {
        const statusCode = error?.status;
        console.error('Error creating namespace:', error);
        if (statusCode === 409) {
          setNamespaceDialogOpen(true);
          setNamespaceExistsError(true);
        }
        throw error;
      }
    }

    setNamespaceDialogOpen(false);

    dispatch(
      clusterAction(() => namespaceRequest(), {
        startMessage: t('translation|Applying {{ newItemName }}…', {
          newItemName: newNamespaceLabel,
        }),
        cancelledMessage: t('translation|Cancelled applying {{ newItemName }}.', {
          newItemName: newNamespaceLabel,
        }),
        successMessage: t('translation|Applied {{ newItemName }}.', {
          newItemName: newNamespaceLabel,
        }),
        errorMessage: t('translation|Failed to create {{ kind }} {{ name }}.', {
          kind: 'namespace',
          name: newNamespaceLabel,
        }),
        cancelCallback: () => {
          setNamespaceDialogOpen(true);
        },
      })
    );
  }

  function handleClose() {
    setNamespaceDialogOpen(false);
    setNamespaceExistsError(false);
  }

  const isValidNamespaceFormat = Namespace.isValidNamespaceFormat(namespaceName);
  const formatHelperMessage = !isValidNamespaceFormat
    ? namespaceName.length > 63
      ? t('translation|Namespaces must be under 64 characters.')
      : t(
          "translation|Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
        )
    : '';

  const isValidNamespaceName = isValidNamespaceFormat && !namespaceExistsError;
  const nameHelperMessage = namespaceExistsError
    ? t('translation|A namespace with this name already exists.')
    : formatHelperMessage;

  // Show the button when namespaces can be created in at least one selected cluster.
  if (allowedClusters.length === 0) {
    return null;
  }

  return (
    <>
      <ActionButton
        data-testid="create-namespace-button"
        color="primary"
        description={t('translation|Create Namespace')}
        icon={'mdi:plus-circle'}
        onClick={() => {
          setNamespaceDialogOpen(true);
        }}
      />

      <Dialog aria-label={t('translation|Dialog')} open={namespaceDialogOpen} onClose={handleClose}>
        <DialogTitle>{t('translation|Create Namespace')}</DialogTitle>
        <DialogContent>
          <Box component="form" style={{ width: '20vw', maxWidth: '20vw' }}>
            <TextField
              margin="dense"
              id="name"
              aria-label={t('translation|Name')}
              label={t('translation|Name')}
              type="text"
              error={!isValidNamespaceName && namespaceName.length > 0}
              helperText={
                !isValidNamespaceName && namespaceName.length > 0 ? nameHelperMessage : ''
              }
              fullWidth
              value={namespaceName}
              onChange={event => {
                setNamespaceName(event.target.value.toLowerCase());
                setNamespaceExistsError(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isValidNamespaceName) {
                    createNewNamespace();
                    dispatchCreateEvent({
                      status: EventStatus.CONFIRMED,
                    });
                  }
                }
              }}
            />
            {selectedClusters.length > 1 && (
              <FormControl fullWidth margin="dense">
                <InputLabel id="create-namespace-cluster-label">{t('glossary|Cluster')}</InputLabel>
                <Select
                  labelId="create-namespace-cluster-label"
                  id="create-namespace-cluster-select"
                  label={t('glossary|Cluster')}
                  value={targetCluster}
                  onChange={event => setSelectedCluster(event.target.value as string)}
                >
                  {allowedClusters.map(cluster => (
                    <MenuItem key={cluster} value={cluster}>
                      {cluster}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button data-testid="create-namespace-dialog-cancel-button" onClick={handleClose}>
            {t('translation|Cancel')}
          </Button>
          <Button
            data-testid="create-namespace-dialog-create-button"
            disabled={!isValidNamespaceName}
            onClick={() => {
              createNewNamespace();
              dispatchCreateEvent({
                status: EventStatus.CONFIRMED,
              });
            }}
          >
            {t('translation|Create')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
