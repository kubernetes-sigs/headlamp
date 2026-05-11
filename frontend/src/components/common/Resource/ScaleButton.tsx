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

import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import { styled } from '@mui/material/styles';
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
import AuthVisible from './AuthVisible';

interface ScaleButtonProps {
  item: Deployment | StatefulSet | ReplicaSet;
  buttonStyle?: ButtonStyle;
  options?: CallbackActionOptions;
}

interface ScaleDialogProps {
  open: boolean;
  resource: Deployment | StatefulSet | ReplicaSet;
  onClose: () => void;
  onSave: (numReplicas: number) => void;
}

const ScaleTextField = styled(TextField)({
  '& input': {
    MozAppearance: 'textfield',
    textAlign: 'center',
  },
  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
    display: 'none',
  },
  width: '80px',
});

/**
 * Extracts the current replica count from a scalable resource's spec.
 *
 * @param resource - A Deployment, StatefulSet, or ReplicaSet resource object.
 * @returns The number of replicas from the resource spec, or -1 if unavailable.
 */
function getReplicas(resource: Deployment | StatefulSet | ReplicaSet) {
  if (!resource || !('spec' in resource) || resource.spec.replicas === undefined) {
    return -1;
  }
  const replicas = resource.spec.replicas;
  const parsed = typeof replicas === 'number' ? replicas : parseInt(replicas as string, 10);
  return Number.isFinite(parsed) ? parsed : -1;
}

function ScaleDialog(props: ScaleDialogProps) {
  const { open, resource, onClose, onSave } = props;
  const [numReplicas, setNumReplicas] = React.useState<number>(getReplicas(resource));

  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setNumReplicas(getReplicas(resource));
    }
    prevOpenRef.current = open;
  }, [open, resource]);

  const { t } = useTranslation(['translation']);
  const desiredNumReplicasLabel = 'desired-number-replicas-label';
  const numReplicasForWarning = 100;
  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.SCALE_RESOURCE);

  const currentNumReplicas = getReplicas(resource);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('Scale Replicas')}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          <Box display="flex" alignItems="center" gap={2}>
            <Typography id={desiredNumReplicasLabel}>{t('Desired replicas')}:</Typography>
            <Box display="flex" alignItems="center">
              <Button
                variant="outlined"
                onClick={() => setNumReplicas(prev => Math.max(0, prev - 1))}
                aria-label={t('Decrease replicas')}
                sx={{ minWidth: '40px', height: '40px', borderRadius: '4px 0 0 4px' }}
              >
                -
              </Button>
              <ScaleTextField
                type="number"
                value={numReplicas === -1 ? '' : numReplicas}
                onChange={e => {
                  const val = parseInt(e.target.value, 10);
                  setNumReplicas(Number.isFinite(val) ? val : -1);
                }}
                inputProps={{
                  'aria-labelledby': desiredNumReplicasLabel,
                  min: 0,
                }}
                variant="outlined"
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 0,
                  },
                }}
              />
              <Button
                variant="outlined"
                onClick={() => setNumReplicas(prev => (prev === -1 ? 1 : prev + 1))}
                aria-label={t('Increase replicas')}
                sx={{ minWidth: '40px', height: '40px', borderRadius: '0 4px 4px 0' }}
              >
                +
              </Button>
            </Box>
          </Box>
          {numReplicas >= numReplicasForWarning && (
            <Typography variant="body2" color="warning.main">
              {t("A large number of replicas may negatively impact the cluster's performance")}
            </Typography>
          )}
          {currentNumReplicas !== -1 && numReplicas !== currentNumReplicas && (
            <Typography variant="body2" color="textSecondary">
              {t('Current number of replicas: {{ numReplicas }}', {
                numReplicas: currentNumReplicas,
              })}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} color="inherit">
          {t('Cancel')}
        </Button>
        <Button
          onClick={() => {
            onSave(numReplicas);
            dispatchHeadlampEvent({
              resource,
              status: EventStatus.CONFIRMED,
            });
            onClose();
          }}
          variant="contained"
          color="primary"
          disabled={numReplicas < 0 || !Number.isFinite(numReplicas)}
        >
          {t('Apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function ScaleButton(props: ScaleButtonProps) {
  const { item, buttonStyle, options = {} } = props;
  const dispatch: AppDispatch = useDispatch();
  const [open, setOpen] = React.useState(false);
  const { t } = useTranslation(['translation']);
  const location = useLocation();

  if (!item || !('isScalable' in item && item.isScalable)) {
    return null;
  }

  function handleSave(numReplicas: number) {
    const cancelUrl = location.pathname;
    const itemName = item.metadata.name;

    setOpen(false);

    dispatch(
      clusterAction(() => item.scale(numReplicas), {
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
        description={t('Scale')}
        buttonStyle={buttonStyle}
        icon="mdi:resize"
        onClick={() => setOpen(true)}
      />
      <ScaleDialog resource={item} open={open} onClose={() => setOpen(false)} onSave={handleSave} />
    </AuthVisible>
  );
}
