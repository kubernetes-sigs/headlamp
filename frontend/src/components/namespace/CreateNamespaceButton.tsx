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
import TextField from '@mui/material/TextField';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getCluster } from '../../lib/cluster';
import Namespace from '../../lib/k8s/namespace';
import { clusterAction } from '../../redux/clusterActionSlice';
import { EventStatus, HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { AppDispatch } from '../../redux/stores/store';
import { ActionButton, AuthVisible } from '../common';

export default function CreateNamespaceButton() {
  const { t } = useTranslation(['glossary', 'translation']);
  const [namespaceName, setNamespaceName] = useState('');
  const [isValidNamespaceName, setIsValidNamespaceName] = useState(false);
  const [nameHelperMessage, setNameHelperMessage] = useState('');
  const [namespaceDialogOpen, setNamespaceDialogOpen] = useState(false);
  const dispatchCreateEvent = useEventCallback(HeadlampEventType.CREATE_RESOURCE);
  const dispatch: AppDispatch = useDispatch();

  function createNewNamespace() {
    const clusterData = getCluster();
    const newNamespaceData = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: namespaceName,
      },
    };

    const newNamespaceName = newNamespaceData.metadata.name;

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
          setIsValidNamespaceName(false);
          setNameHelperMessage(t('translation|A namespace with this name already exists.'));
        }
        throw error;
      }
    }

    setNamespaceDialogOpen(false);

    dispatch(
      clusterAction(() => namespaceRequest(), {
        startMessage: t('translation|Applying {{  newItemName  }}…', {
          newItemName: newNamespaceName,
        }),
        cancelledMessage: t('translation|Cancelled applying  {{  newItemName  }}.', {
          newItemName: newNamespaceName,
        }),
        successMessage: t('translation|Applied {{ newItemName }}.', {
          newItemName: newNamespaceName,
        }),
        errorMessage: t('translation|Failed to create {{ kind }} {{ name }}.', {
          kind: 'namespace',
          name: newNamespaceName,
        }),
        cancelCallback: () => {
          setNamespaceDialogOpen(true);
        },
      })
    );
  }

  useEffect(() => {
    const isValidNamespaceFormat = Namespace.isValidNamespaceFormat(namespaceName);
    setIsValidNamespaceName(isValidNamespaceFormat);

    if (!isValidNamespaceFormat) {
      if (namespaceName.length > 63) {
        setNameHelperMessage(t('translation|Namespaces must be under 64 characters.'));
      } else {
        setNameHelperMessage(
          t(
            "translation|Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
          )
        );
      }
    }
  }, [namespaceName]);

  return (
    <AuthVisible item={Namespace} authVerb="create">
      <ActionButton
        data-testid="create-namespace-button"
        color="primary"
        description={t('translation|Create Namespace')}
        icon={'mdi:plus-circle'}
        onClick={() => {
          setNamespaceDialogOpen(true);
        }}
      />

      <Dialog
        aria-label="Dialog"
        open={namespaceDialogOpen}
        onClose={() => setNamespaceDialogOpen(false)}
      >
        <DialogTitle>{t('translation|Create Namespace')}</DialogTitle>
        <DialogContent>
          <Box component="form" style={{ width: '20vw', maxWidth: '20vw' }}>
            <TextField
              margin="dense"
              id="name"
              aria-label="Name"
              label={t('translation|Name')}
              type="text"
              error={!isValidNamespaceName && namespaceName.length > 0}
              helperText={
                !isValidNamespaceName && namespaceName.length > 0 ? nameHelperMessage : ''
              }
              fullWidth
              value={namespaceName}
              onChange={event => setNamespaceName(event.target.value.toLowerCase())}
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            data-testid="create-namespace-dialog-cancel-button"
            onClick={() => {
              setNamespaceDialogOpen(false);
            }}
          >
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
    </AuthVisible>
  );
}
