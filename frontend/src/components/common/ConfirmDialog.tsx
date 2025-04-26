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
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { onConfirm, open, handleClose, title, description, cancelLabel, confirmLabel } = props;
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
          <Button onClick={handleClose} color="secondary" variant="contained">
            {cancelLabel || t('No')}
          </Button>
          <Button onClick={onConfirmationClicked} color="primary" variant="contained">
            {confirmLabel || t('Yes')}
          </Button>
        </DialogActions>
      </MuiDialog>
    </div>
  );
}

export default ConfirmDialog;
