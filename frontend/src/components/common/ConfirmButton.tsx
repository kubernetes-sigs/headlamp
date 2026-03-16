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

import Button, { ButtonProps } from '@mui/material/Button';
import React from 'react';
import { ConfirmDialog } from './Dialog';

export interface ConfirmButtonProps extends ButtonProps {
  buttonComponent?: typeof Button;
  ariaLabel?: string;
  confirmTitle: string;
  confirmDescription: string;
  onConfirm: (...args: any[]) => void;
  [otherProps: string]: any;
}

export default function ConfirmButton(props: ConfirmButtonProps) {
  const {
    buttonComponent,
    ariaLabel,
    confirmTitle,
    confirmDescription,
    onConfirm,
    children,
    ...other
  } = props;
  const [openConfirm, setOpenConfirm] = React.useState(false);

  const ButtonComponent = buttonComponent || Button;

  return (
    <React.Fragment>
      <ButtonComponent
        aria-label={ariaLabel}
        onClick={() => setOpenConfirm(true)}
        children={children}
        {...other}
      />
      <ConfirmDialog
        open={openConfirm}
        title={confirmTitle}
        description={confirmDescription}
        handleClose={() => setOpenConfirm(false)}
        onConfirm={onConfirm}
      />
    </React.Fragment>
  );
}
