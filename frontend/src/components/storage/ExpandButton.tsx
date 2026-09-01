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

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import PersistentVolumeClaim from '../../lib/k8s/persistentVolumeClaim';
import StorageClass from '../../lib/k8s/storageClass';
import { parseDiskSpace, splitQuantity } from '../../lib/units';
import { CallbackActionOptions, clusterAction } from '../../redux/clusterActionSlice';
import { EventStatus, HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { AppDispatch } from '../../redux/stores/store';
import ActionButton, { ButtonStyle } from '../common/ActionButton';
import AuthVisible from '../common/Resource/AuthVisible';

const STORAGE_UNITS = ['Ki', 'Mi', 'Gi', 'Ti', 'M', 'G', 'T'];

export interface ExpandButtonProps {
  item: PersistentVolumeClaim;
  buttonStyle?: ButtonStyle;
  options?: CallbackActionOptions;
}

/**
 * Expands a claim, when its storage class allows it.
 *
 * Growing a volume is a patch of the requested size. The storage provider only honours
 * it when its class sets allowVolumeExpansion, so the button is hidden otherwise rather
 * than offering an action the cluster would reject.
 * @param props - The claim to expand, and how to present the button.
 * @returns The button, or nothing when this claim cannot be expanded.
 */
export default function ExpandButton(props: ExpandButtonProps) {
  const { item } = props;
  const storageClassName = item?.spec?.storageClassName;

  if (!storageClassName || item.status?.phase !== 'Bound') {
    return null;
  }

  return <ExpandAction {...props} storageClassName={storageClassName} />;
}

function ExpandAction(props: ExpandButtonProps & { storageClassName: string }) {
  const { item, storageClassName, buttonStyle, options = {} } = props;
  const dispatch: AppDispatch = useDispatch();
  const location = useLocation();
  const { t } = useTranslation();
  const [openDialog, setOpenDialog] = React.useState(false);
  const [storageClass, storageClassError] = StorageClass.useGet(storageClassName, undefined, {
    cluster: item.cluster,
  });

  function handleSave(storage: string) {
    const itemName = item.metadata.name;
    const cancelUrl = location.pathname;

    setOpenDialog(false);

    dispatch(
      clusterAction(() => item.expandTo(storage), {
        startMessage: t('Expanding {{ itemName }}…', { itemName }),
        cancelledMessage: t('Cancelled expanding {{ itemName }}.', { itemName }),
        successMessage: t('Expanded {{ itemName }}.', { itemName }),
        errorMessage: t('Failed to expand {{ itemName }}.', { itemName }),
        cancelUrl,
        errorUrl: cancelUrl,
        ...options,
      })
    );
  }

  if (storageClass && !storageClass.allowVolumeExpansion) {
    return null;
  }
  if (!storageClass && !storageClassError) {
    return null;
  }

  return (
    <AuthVisible
      item={item}
      authVerb="patch"
      onError={(err: Error) => {
        console.error(`Error while getting authorization for expanding ${item.getName()}:`, err);
      }}
    >
      <ActionButton
        description={t('translation|Expand')}
        buttonStyle={buttonStyle}
        onClick={() => setOpenDialog(true)}
        icon="mdi:arrow-expand-all"
      />
      <ExpandDialog
        resource={item}
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        onSave={handleSave}
      />
    </AuthVisible>
  );
}

export interface ExpandDialogProps {
  resource: PersistentVolumeClaim;
  open: boolean;
  onClose: () => void;
  onSave: (storage: string) => void;
}

/** Asks for the size to grow a claim to, starting from the size it requests today. */
export function ExpandDialog(props: ExpandDialogProps) {
  const { open, resource, onClose, onSave } = props;
  const { t } = useTranslation(['translation']);
  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.EXPAND_RESOURCE);

  const currentStorage = resource.requestedStorage ?? '';
  const currentParts = splitQuantity(currentStorage);
  const [value, setValue] = React.useState<string>(String(currentParts?.value ?? ''));
  const [unit, setUnit] = React.useState<string>(currentParts?.unit || 'Gi');

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const parts = splitQuantity(currentStorage);
    setValue(String(parts?.value ?? ''));
    setUnit(parts?.unit || 'Gi');
  }, [open, currentStorage]);

  const newStorage = value === '' ? '' : `${value}${unit}`;
  const isLarger = !!newStorage && parseDiskSpace(newStorage) > parseDiskSpace(currentStorage);
  // Only a size that would actually shrink the volume is an error. The size the claim
  // already has is what the dialog opens on, so flagging it would greet the user with a
  // complaint about a value they have not typed; Apply stays disabled either way.
  const isSmaller = !!newStorage && parseDiskSpace(newStorage) < parseDiskSpace(currentStorage);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t('translation|Expand Volume')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('translation|Current size: {{ size }}', { size: currentStorage })}
        </DialogContentText>
        <Stack direction="row" spacing={1} sx={{ marginTop: 2 }}>
          <TextField
            size="small"
            type="number"
            label={t('translation|New size')}
            value={value}
            onChange={event => setValue(event.target.value)}
            error={isSmaller}
            helperText={
              isSmaller ? t('translation|A volume can only be expanded, not shrunk.') : ' '
            }
            inputProps={{ min: 0, step: 1 }}
          />
          <TextField
            select
            size="small"
            label={t('translation|Unit')}
            value={unit}
            onChange={event => setUnit(event.target.value)}
            sx={{ minWidth: '90px' }}
            helperText=" "
          >
            {STORAGE_UNITS.map(storageUnit => (
              <MenuItem key={storageUnit} value={storageUnit}>
                {storageUnit}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary" variant="contained">
          {t('translation|Cancel')}
        </Button>
        <Button
          onClick={() => {
            onSave(newStorage);
            dispatchHeadlampEvent({ resource, status: EventStatus.CONFIRMED });
          }}
          disabled={!isLarger}
          variant="contained"
          color="primary"
        >
          {t('translation|Apply')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
