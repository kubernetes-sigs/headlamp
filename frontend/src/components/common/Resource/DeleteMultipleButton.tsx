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
import Grid from '@mui/material/Grid';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import _, { uniq } from 'lodash';
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

interface DeleteMultipleButtonProps {
  items?: KubeObject[];
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

interface DeleteMultipleButtonDescriptionProps {
  items?: KubeObject[];
}

function DeleteMultipleButtonDescription(props: DeleteMultipleButtonDescriptionProps) {
  const { t } = useTranslation(['translation']);
  const clusters = uniq(props.items?.map(it => it.cluster));
  return (
    <p>
      {t('Are you sure you want to delete the following items?')}
      <ul>
        {props.items?.map(item => (
          <li key={item.metadata.uid}>
            {item.kind}: {item.metadata.name}{' '}
            {clusters.length > 0 ? `(cluster: ${item.cluster})` : ''}
          </li>
        ))}
      </ul>
    </p>
  );
}

export default function DeleteMultipleButton(props: DeleteMultipleButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const settingsObj = useSettings();

  const { items, options, afterConfirm, buttonStyle } = props;
  const [openAlert, setOpenAlert] = React.useState(false);
  // For protected (system) namespaces the user must type their names to confirm deletion.
  const [confirmInput, setConfirmInput] = React.useState('');
  const { t } = useTranslation(['translation']);
  const location = useLocation();
  const dispatchDeleteEvent = useEventCallback(HeadlampEventType.DELETE_RESOURCES);

  // Protected namespaces included in the current selection, if any.
  const protectedNamespaces = (items ?? []).filter(
    item =>
      item.kind === Namespace.kind &&
      typeof (item as any).isProtected === 'function' &&
      (item as any).isProtected()
  );
  // Build the confirm string from the same label-or-name value that isProtected() checks,
  // de-duped and sorted alphabetically so the expected order is deterministic for the user.
  const protectedNamespaceNames = uniq(
    protectedNamespaces.map(
      item => item.metadata.labels?.['kubernetes.io/metadata.name'] ?? item.metadata.name
    )
  ).sort();
  const confirmString = protectedNamespaceNames.join(', ');
  // Normalize the typed input the same way (split on commas, trim, drop blanks, de-dupe,
  // sort) so the comparison is tolerant of spacing and ordering differences.
  const normalizedConfirmInput = uniq(
    confirmInput
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
  ).sort();
  const confirmButtonDisabled =
    protectedNamespaces.length > 0 &&
    normalizedConfirmInput.join(', ') !== protectedNamespaceNames.join(', ');

  const deleteFunc = React.useCallback(
    (items: KubeObject[]) => {
      if (!items || items.length === 0) {
        return;
      }
      const clonedItems = _.cloneDeep(items);
      const itemsLength = clonedItems.length;

      dispatch(
        clusterAction(
          async () => {
            await Promise.all(
              items.map(item => {
                if (settingsObj.useEvict && item.kind === 'Pod') {
                  const pod = item as Pod;
                  return pod.evict();
                }
                return item.delete();
              })
            );
          },
          {
            startMessage: t('Deleting {{ itemsLength }} items…', { itemsLength }),
            cancelledMessage: t('Cancelled deletion of {{ itemsLength }} items.', { itemsLength }),
            successMessage: t('Deleted {{ itemsLength }} items.', { itemsLength }),
            errorMessage: t('Error deleting {{ itemsLength }} items.', { itemsLength }),
            cancelUrl: location.pathname,
            startUrl: location.pathname,
            errorUrl: location.pathname,
            ...options,
          }
        )
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options]
  );

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <>
      <ActionButton
        description={t('translation|Delete items')}
        buttonStyle={buttonStyle}
        onClick={() => {
          setConfirmInput('');
          setOpenAlert(true);
        }}
        icon="mdi:delete"
      />
      <ConfirmDialog
        open={openAlert}
        title={t('translation|Delete items')}
        description={
          <Grid container direction="column">
            <Grid item>
              <DeleteMultipleButtonDescription items={items} />
            </Grid>
            {protectedNamespaces.length > 0 && (
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
                      'translation|Your selection includes system namespaces. Deleting them may break your cluster.'
                    )}
                  </Alert>
                </Grid>
                <Grid item sx={{ mt: 2.5 }}>
                  <Typography variant="body1" sx={{ mb: 1.5 }}>
                    {t('translation|To confirm, type {{ names }} in the field below.', {
                      names: confirmString,
                    })}
                  </Typography>
                  <TextField
                    fullWidth
                    autoComplete="off"
                    value={confirmInput}
                    onChange={event => setConfirmInput(event.target.value)}
                    placeholder={confirmString}
                    inputProps={{ 'aria-label': t('translation|Namespace name(s)') }}
                  />
                </Grid>
              </>
            )}
          </Grid>
        }
        confirmButtonDisabled={confirmButtonDisabled}
        handleClose={() => setOpenAlert(false)}
        onConfirm={() => {
          deleteFunc(items);
          dispatchDeleteEvent({
            resources: items,
            status: EventStatus.CONFIRMED,
          });
          if (afterConfirm) {
            afterConfirm();
          }
        }}
      />
    </>
  );
}
