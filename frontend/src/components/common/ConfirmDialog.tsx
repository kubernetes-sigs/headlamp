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
import MuiDialog, { DialogProps as MuiDialogProps } from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import React, { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogTitle } from './Dialog';

export interface ConfirmDialogProps extends MuiDialogProps {
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  handleClose: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
  /**
   * Disables the Cancel button, defaults to false
   */
  hideCancelButton?: boolean;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    onConfirm,
    open,
    handleClose,
    title,
    description,
    cancelLabel,
    confirmLabel,
    hideCancelButton = false,
  } = props;
  const { t } = useTranslation();

  function onConfirmationClicked() {
    handleClose();
    onConfirm();
  }

  const focusedRef = React.useCallback((node: HTMLElement) => {
    if (node !== null) {
      node.setAttribute('tabindex', '-1');
      node.focus();
    }
  }, []);

  return (
    <div>
      <MuiDialog
        open={open}
        onClose={handleClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{title}</DialogTitle>
        <DialogContent ref={focusedRef} sx={{ py: 1 }}>
          <DialogContentText id="alert-dialog-description" component="div">
            {description}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          {!hideCancelButton && (
            <Button
              onClick={handleClose}
              aria-label="cancel-button"
              color="secondary"
              variant="contained"
            >
              {cancelLabel || t('No')}
            </Button>
          )}
          <Button
            onClick={onConfirmationClicked}
            aria-label="confirm-button"
            color="primary"
            variant="contained"
          >
            {confirmLabel || t('Yes')}
          </Button>
        </DialogActions>
      </MuiDialog>
    </div>
  );
}

export default ConfirmDialog;
