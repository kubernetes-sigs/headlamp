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

import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Switch from '@mui/material/Switch';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { KubeObject } from '../../../lib/k8s/KubeObject';
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
              <Grid item>
                <FormControlLabel
                  control={
                    <Switch
                      checked={forceDelete}
                      onChange={() => setForceDelete(!forceDelete)}
                      name="forceDelete"
                    />
                  }
                  label={t('Force Delete')}
                />
              </Grid>
            )}
          </Grid>
        }
        handleClose={() => setOpenAlert(false)}
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
