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
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import ActionButton, { ButtonStyle } from '../ActionButton';

export interface KubectlCopyButtonProps {
  item: KubeObject;
  buttonStyle?: ButtonStyle;
}

export default function KubectlCopyButton({ item, buttonStyle }: KubectlCopyButtonProps) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const getKubectlCommand = (action: 'get' | 'delete') => {
    const kind = item.kind.toLowerCase();
    const name = item.metadata.name;
    const namespace = item.metadata.namespace;

    if (action === 'get') {
      return `kubectl get ${kind} ${name}${namespace ? ` -n ${namespace}` : ''} -o yaml`;
    }
    return `kubectl delete ${kind} ${name}${namespace ? ` -n ${namespace}` : ''}`;
  };

  const copyToClipboard = async (text: string) => {
    handleClose();
    await navigator.clipboard.writeText(text);
  };

  return (
    <>
      <ActionButton
        description={t('translation|Copy as kubectl command')}
        buttonStyle={buttonStyle}
        onClick={handleClick}
        icon="mdi:console-line"
      />
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'kubectl-copy-button',
        }}
      >
        <MenuItem onClick={() => copyToClipboard(getKubectlCommand('get'))}>
          <Icon icon="mdi:eye" width="20" style={{ marginRight: '8px' }} />
          {t('translation|Copy get command')}
        </MenuItem>
        <MenuItem onClick={() => copyToClipboard(getKubectlCommand('delete'))}>
          <Icon icon="mdi:delete" width="20" style={{ marginRight: '8px' }} />
          {t('translation|Copy delete command')}
        </MenuItem>
      </Menu>
    </>
  );
}
