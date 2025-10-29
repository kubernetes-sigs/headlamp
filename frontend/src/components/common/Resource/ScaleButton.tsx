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
import Button from '@mui/material/Button';
import Dialog, { DialogProps } from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Fab from '@mui/material/Fab';
import Grid from '@mui/material/Grid';
import OutlinedInput from '@mui/material/OutlinedInput';
import { styled, useTheme } from '@mui/material/styles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import Deployment from '../../../lib/k8s/deployment';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { CallbackActionOptions, clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import ActionButton, { ButtonStyle } from '../ActionButton';
import { LightTooltip } from '../Tooltip';
import AuthVisible from './AuthVisible';

interface ScaleButtonProps {
  item: (Deployment | StatefulSet | ReplicaSet) & { _class?: () => { isScalable?: boolean } };
  buttonStyle?: ButtonStyle;
  options?: CallbackActionOptions;
}

export default function ScaleButton(props: ScaleButtonProps) {
  const dispatch: AppDispatch = useDispatch();

  const { item, buttonStyle, options = {} } = props;
  const [openDialog, setOpenDialog] = React.useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  async function updateFunc(numReplicas: number) {
    try {
      await item.scale(numReplicas);
    } catch (err) {
      throw err;
    }
  }

  const applyFunc = React.useCallback(updateFunc, [item]);

  function handleSave(numReplicas: number) {
    const cancelUrl = location.pathname;
    const itemName = item.metadata.name;

    setOpenDialog(false);

    // setOpenDialog(false);
    dispatch(
      clusterAction(() => applyFunc(numReplicas), {
        startMessage: t('Scaling {{ itemName }}…', { itemName }),
        cancelledMessage: t('Cancelled scaling {{ itemName }}.', { itemName }),
        successMessage: t('Scaled {{ itemName }}.', { itemName }),
        errorMessage: t('Failed to scale {{ itemName }}.', { itemName }),
        cancelUrl,
        errorUrl: cancelUrl,
        ...options,
      })
    );
  }

  function handleClose() {
    setOpenDialog(false);
  }

  if (!item || !item?.isScalable) {
    return null;
  }

  return (
    <AuthVisible
      item={item}
      authVerb="patch"
      subresource="scale"
      onError={(err: Error) => {
        console.error(`Error while getting authorization for scaling button in ${item}:`, err);
      }}
    >
      <ActionButton
        description={t('translation|Scale')}
        buttonStyle={buttonStyle}
        onClick={() => {
          setOpenDialog(true);
        }}
        icon="mdi:expand-all"
      />
      <ScaleDialog resource={item} open={openDialog} onClose={handleClose} onSave={handleSave} />
    </AuthVisible>
  );
}

interface ScaleDialogProps extends Omit<DialogProps, 'resource'> {
  resource: Deployment | StatefulSet | ReplicaSet;
  onSave: (numReplicas: number) => void;
  onClose: () => void;
  errorMessage?: string;
}

const Input = styled(OutlinedInput)({
  '& input[type=number]': {
    MozAppearance: 'textfield',
    textAlign: 'center',
  },
  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
    display: 'none',
  },
  width: '80px',
});

function ScaleDialog(props: ScaleDialogProps) {
  const { open, resource, onClose, onSave } = props;
  const [numReplicas, setNumReplicas] = React.useState<number>(getNumReplicas());
  const { t } = useTranslation(['translation']);
  const theme = useTheme();
  const desiredNumReplicasLabel = 'desired-number-replicas-label';
  const numReplicasForWarning = 100;
  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.SCALE_RESOURCE);

  function getNumReplicas() {
    if (!('spec' in resource)) {
      return -1;
    }

    return parseInt(resource.spec.replicas);
  }

  const currentNumReplicas = getNumReplicas();

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Scale Replicas')}</DialogTitle>
      <DialogContent
        sx={{
          paddingBottom: '30px', // Prevent the content from overflowing
        }}
      >
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <DialogContentText>
              {t('translation|Current number of replicas: {{ numReplicas }}', {
                numReplicas:
                  currentNumReplicas === -1 ? t('translation|Unknown') : currentNumReplicas,
              })}
            </DialogContentText>
          </Grid>
          <Grid item container alignItems="center" spacing={1}>
            <Grid item sm="auto" xs={12}>
              <DialogContentText id={desiredNumReplicasLabel}>
                {t('translation|Desired number of replicas:')}
              </DialogContentText>
            </Grid>
            <Grid item spacing={2} sm="auto" sx={{ padding: '6px', textAlign: 'left' }}>
              <Fab
                size="small"
                color="secondary"
                onClick={() => setNumReplicas(numReplicas => Math.max(0, numReplicas - 1))}
                aria-label={t('translation|Decrement')}
                disabled={numReplicas <= 0}
                sx={{ boxShadow: 'none' }}
              >
                <Icon icon="mdi:minus" width="22px" />
              </Fab>
              <Input
                size="small"
                type="number"
                value={numReplicas}
                sx={{ marginLeft: '6px', marginRight: '6px' }}
                onChange={e => setNumReplicas(Math.max(0, Number(e.target.value)))}
                aria-labelledby={desiredNumReplicasLabel}
                inputProps={{
                  min: 0,
                  step: 1,
                }}
              />

              <Fab
                size="small"
                color="secondary"
                onClick={() => setNumReplicas(numReplicas => numReplicas + 1)}
                aria-label={t('translation|Increment')}
                sx={{ boxShadow: 'none' }}
              >
                <Icon icon="mdi:plus" width="22px" />
              </Fab>
            </Grid>
            <Grid item xs="auto">
              {numReplicas >= numReplicasForWarning && (
                <LightTooltip
                  title={t(
                    "A large number of replicas may negatively impact the cluster's performance"
                  )}
                >
                  <Icon icon="mdi:warning" width="28px" color={theme.palette.warning.main} />
                </LightTooltip>
              )}
            </Grid>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="contained">
          {t('translation|Cancel')}
        </Button>
        <Button
          onClick={() => {
            onSave(numReplicas);
            dispatchHeadlampEvent({
              resource: resource,
              status: EventStatus.CONFIRMED,
            });
          }}
          variant="contained"
          color="primary"
        >
          {t('translation|Apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
