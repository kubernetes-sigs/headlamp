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
import MuiDialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { DialogTitle } from '../common/Dialog';
import { DOCKER_DESKTOP_MAX_PORT, DOCKER_DESKTOP_MIN_PORT } from '../common/Resource/PortForward';

export interface PortForwardStartDialogProps {
  open: boolean;
  defaultPort?: string;
  podName: string;
  namespace: string;
  containerPort: string | number;
  onCancel: () => void;
  onConfirm: (portInput?: string) => void;
  isDockerDesktop?: boolean;
}

export default function PortForwardStartDialog(props: PortForwardStartDialogProps) {
  const {
    open,
    defaultPort,
    podName,
    namespace,
    containerPort,
    onCancel,
    onConfirm,
    isDockerDesktop,
  } = props;
  const { t } = useTranslation(['translation']);
  const [portValue, setPortValue] = React.useState<string>(defaultPort || '');
  const [errorText, setErrorText] = React.useState<string>('');

  React.useEffect(() => {
    setPortValue(defaultPort || '');
    setErrorText('');
  }, [open, defaultPort]);

  function validatePort(value: string): string {
    if (!value) return '';
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return t('translation|Please enter a valid port number (1-65535).');
    }

    // Docker Desktop port range validation
    if (isDockerDesktop && (n < DOCKER_DESKTOP_MIN_PORT || n > DOCKER_DESKTOP_MAX_PORT)) {
      return t('translation|Docker Desktop requires ports in range 30000-32000.');
    }

    return '';
  }

  function handleConfirm() {
    const trimmedValue = portValue.trim();
    const err = validatePort(trimmedValue);
    setErrorText(err);
    if (err) return;
    onConfirm(trimmedValue || undefined);
  }

  function handleKeyPress(event: React.KeyboardEvent) {
    if (event.key === 'Enter') {
      handleConfirm();
    }
  }

  const helper = isDockerDesktop
    ? t('translation|Leave empty to auto-assign from range 30000-32000.')
    : t('translation|Leave empty to auto-assign an available port.');

  return (
    <MuiDialog open={open} onClose={() => onCancel()} aria-labelledby="pf-start-dialog-title">
      <DialogTitle id="pf-start-dialog-title">{t('translation|Start Port Forward')}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          {t('translation|Target')}: {podName} ({namespace}) • {t('translation|Container Port')}:{' '}
          {containerPort}
        </Typography>
        <TextField
          label={t('translation|Local Port')}
          placeholder={isDockerDesktop ? t('translation|e.g. 30080') : t('translation|e.g. 8080')}
          fullWidth
          value={portValue}
          onChange={e => setPortValue(e.target.value)}
          onKeyPress={handleKeyPress}
          error={!!errorText}
          helperText={errorText || helper}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="secondary" variant="contained">
          {t('translation|Cancel')}
        </Button>
        <Button onClick={handleConfirm} color="primary" variant="contained">
          {t('translation|Start')}
        </Button>
      </DialogActions>
    </MuiDialog>
  );
}
