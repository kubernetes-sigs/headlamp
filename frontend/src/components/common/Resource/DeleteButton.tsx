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

import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Namespace from '../../../lib/k8s/namespace';
import Pod from '../../../lib/k8s/pod';
import { CallbackActionOptions, clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { useSettings } from '../../App/Settings/hook';
import ActionButton, { ButtonStyle } from '../ActionButton';
import { ConfirmDialog } from '../Dialog';
import AuthVisible from './AuthVisible';

interface DeleteButtonProps {
  item?: KubeObject;
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

export default function DeleteButton(props: DeleteButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const settingsObj = useSettings();

  const { item, options, buttonStyle, afterConfirm } = props;
  const [openAlert, setOpenAlert] = React.useState(false);
  const [forceDelete, setForceDelete] = React.useState(false);
  // For protected (system) namespaces the user must type the name to confirm deletion.
  const [confirmInput, setConfirmInput] = React.useState('');
  const location = useLocation();
  const { t } = useTranslation(['translation']);
  const dispatchDeleteEvent = useEventCallback(HeadlampEventType.DELETE_RESOURCE);

  const deleteFunc = React.useCallback(
    () => {
      if (!item) {
        return;
      }

      let callback = item!.delete;
      if (settingsObj.useEvict && item.kind === 'Pod') {
        const pod = item as Pod;
        callback = pod.evict;
      }

      const itemName = item!.metadata.name;

      callback &&
        dispatch(
          clusterAction(callback.bind(item), {
            callbackArgs: [forceDelete],
            startMessage: t('Deleting item {{ itemName }}…', { itemName }),
            cancelledMessage: t('Cancelled deletion of {{ itemName }}.', { itemName }),
            successMessage: t('Deleted item {{ itemName }}.', { itemName }),
            errorMessage: t('Error deleting item {{ itemName }}.', { itemName }),
            cancelUrl: location.pathname,
            startUrl: item!.getListLink(),
            errorUrl: item!.getListLink(),
            ...options,
          })
        );
    },
    // eslint-disable-next-line
    [item, forceDelete]
  );

  if (!item) {
    return null;
  }

  // System namespaces require an extra type-to-confirm step before they can be deleted.
  const isProtectedNamespace =
    item.kind === Namespace.kind &&
    typeof (item as any).isProtected === 'function' &&
    (item as any).isProtected();
  // Use the same label-or-name value that isProtected() checks so the confirmation prompt matches.
  const namespaceName = item.metadata.labels?.['kubernetes.io/metadata.name'] ?? item.metadata.name;

  return (
    <AuthVisible
      item={item}
      authVerb="delete"
      onError={(err: Error) => {
        console.error(`Error while getting authorization for delete button in ${item}:`, err);
      }}
    >
      <ActionButton
        description={
          settingsObj.useEvict && item.kind === 'Pod'
            ? t('translation|Evict')
            : t('translation|Delete')
        }
        buttonStyle={buttonStyle}
        onClick={() => {
          setConfirmInput('');
          setOpenAlert(true);
        }}
        icon="mdi:delete"
      />

      <ConfirmDialog
        open={openAlert}
        title={
          settingsObj.useEvict && item.kind === 'Pod'
            ? t('translation|Evict Pod')
            : t('translation|Delete item')
        }
        description={
          <Grid container direction="column">
            <Grid item>
              {settingsObj.useEvict && item.kind === 'Pod'
                ? t('translation|Are you sure you want to evict pod {{ itemName }}?', {
                    itemName: item.metadata.name,
                  })
                : t('translation|Are you sure you want to delete item {{ itemName }}?', {
                    itemName: item.metadata.name,
                  })}
            </Grid>
            {(!settingsObj.useEvict || item.kind !== 'Pod') && (
              <Grid item sx={{ mt: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={forceDelete}
                      onChange={() => setForceDelete(!forceDelete)}
                      name="forceDelete"
                    />
                  }
                  label={t('Force Delete')}
                />
              </Grid>
            )}
            {isProtectedNamespace && (
              <>
                <Grid item sx={{ mt: 2 }}>
                  <Alert
                    severity="warning"
                    variant="outlined"
                    sx={theme => ({
                      color: theme.palette.warning.main,
                      borderColor: theme.palette.warning.main,
                      '& .MuiAlert-icon': { color: theme.palette.warning.main },
                      '& .MuiAlert-message': { fontSize: '0.95rem', fontWeight: 600 },
                    })}
                  >
                    {t(
                      'translation|This is a system namespace. Deleting it may break your cluster.'
                    )}
                  </Alert>
                </Grid>
                <Grid item sx={{ mt: 2.5 }}>
                  <Typography variant="body1" sx={{ mb: 1.5 }}>
                    {t('translation|To confirm, type {{ name }} in the field below.', {
                      name: namespaceName,
                    })}
                  </Typography>
                  <TextField
                    fullWidth
                    autoComplete="off"
                    value={confirmInput}
                    onChange={event => setConfirmInput(event.target.value)}
                    placeholder={namespaceName}
                    inputProps={{ 'aria-label': t('translation|Namespace name') }}
                  />
                </Grid>
              </>
            )}
          </Grid>
        }
        handleClose={() => setOpenAlert(false)}
        confirmButtonDisabled={isProtectedNamespace && confirmInput.trim() !== namespaceName}
        cancelLabel={t('Cancel')}
        confirmLabel={settingsObj.useEvict && item.kind === 'Pod' ? t('Evict') : t('Delete')}
        onConfirm={() => {
          deleteFunc();
          dispatchDeleteEvent({
            resource: item,
            status: EventStatus.CONFIRMED,
          });
          if (afterConfirm) {
            afterConfirm();
          }
        }}
      />
    </AuthVisible>
  );
}
