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
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import _, { uniq } from 'lodash';
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

interface DeleteMultipleButtonProps {
  items?: KubeObject[];
  options?: CallbackActionOptions;
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

interface DeleteMultipleButtonDescriptionProps {
  items?: KubeObject[];
  loading?: boolean;
  error?: string;
}

function DeleteMultipleButtonDescription(props: DeleteMultipleButtonDescriptionProps) {
  const { items, loading, error } = props;
  const { t } = useTranslation(['translation']);
  const clusters = uniq(props.items?.map(it => it.cluster));
  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" p={2}>
        <CircularProgress size={24} sx={{ mr: 2 }} />
        <Typography>{t('Deleting {{ count }} items…', { count: items?.length || 0 })}</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography color="error" gutterBottom>
          {error}
        </Typography>
        <Typography variant="body2">
          {t('The following items were selected for deletion:')}
        </Typography>
        <ul>
          {items?.map(item => (
            <li key={item.metadata.uid}>
              {item.kind}: {item.metadata.name}{' '}
              {clusters.length > 1 ? `(cluster: ${item.cluster})` : ''}
            </li>
          ))}
        </ul>
      </Box>
    );
  }
  return (
    <p>
      {t('Are you sure you want to delete the following items?')}
      <ul>
        {items?.map(item => (
          <li key={item.metadata.uid}>
            {item.kind}: {item.metadata.name}{' '}
            {clusters.length > 0 ? `(cluster: ${item.cluster})` : ''}
          </li>
        ))}
      </ul>
    </p>
  );
}

export interface PureDeleteMultipleButtonProps {
  items?: KubeObject[];
  buttonStyle?: ButtonStyle;
  open: boolean;
  onToggleOpen: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
  error?: string;
}

export function PureDeleteMultipleButton(props: PureDeleteMultipleButtonProps) {
  const { items, buttonStyle, open, onToggleOpen, onConfirm, loading, error } = props;
  const { t } = useTranslation(['translation']);

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <>
      <ActionButton
        description={t('translation|Delete items')}
        buttonStyle={buttonStyle}
        onClick={() => onToggleOpen(true)}
        icon="mdi:delete"
      />
      <ConfirmDialog
        open={open}
        title={error ? t('translation|Delete failed') : t('translation|Delete items')}
        description={
          <DeleteMultipleButtonDescription items={items} loading={loading} error={error} />
        }
        handleClose={() => !loading && onToggleOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}

export default function DeleteMultipleButton(props: DeleteMultipleButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const settingsObj = useSettings();

  const { items, options, afterConfirm, buttonStyle } = props;
  const [openAlert, setOpenAlert] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);
  const { t } = useTranslation(['translation']);
  const location = useLocation();
  const dispatchDeleteEvent = useEventCallback(HeadlampEventType.DELETE_RESOURCES);

  const deleteFunc = React.useCallback(
    async (items: KubeObject[]) => {
      if (!items || items.length === 0) {
        return;
      }
      const clonedItems = _.cloneDeep(items);
      const itemsLength = clonedItems.length;
      setLoading(true);
      setError(undefined);

      try {
        await dispatch(
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
              cancelledMessage: t('Cancelled deletion of {{ itemsLength }} items.', {
                itemsLength,
              }),
              successMessage: t('Deleted {{ itemsLength }} items.', { itemsLength }),
              errorMessage: t('Error deleting {{ itemsLength }} items.', { itemsLength }),
              cancelUrl: location.pathname,
              startUrl: location.pathname,
              errorUrl: location.pathname,
              ...options,
            }
          )
        );
        setLoading(false);
        setOpenAlert(false);
        if (afterConfirm) {
          afterConfirm();
        }
      } catch (err) {
        setLoading(false);
        setError(
          err instanceof Error
            ? err.message
            : t('Error deleting {{ itemsLength }} items.', { itemsLength })
        );
      }
    },
    [options, afterConfirm]
  );

  const handleConfirm = () => {
    if (!items) return;
    dispatchDeleteEvent({
      resources: items,
      status: EventStatus.CONFIRMED,
    });
    deleteFunc(items);
  };

  const handleToggleOpen = (open: boolean) => {
    setOpenAlert(open);
    if (!open) {
      setError(undefined);
    }
  };

  return (
    <PureDeleteMultipleButton
      items={items}
      buttonStyle={buttonStyle}
      open={openAlert}
      onToggleOpen={handleToggleOpen}
      onConfirm={handleConfirm}
      loading={loading}
      error={error}
    />
  );
}
