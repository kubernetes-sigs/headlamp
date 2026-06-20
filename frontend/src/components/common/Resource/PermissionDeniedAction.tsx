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
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';
import type { AuthRequestResourceAttrs } from '../../../lib/k8s/KubeObject';
import type { ButtonStyle } from '../ActionButton';
import type { AuthVisibleResult } from './AuthVisible';

function formatAuthRequest(attrs: AuthRequestResourceAttrs, namespaceLabel: string) {
  const api = [attrs.group, attrs.version].filter(Boolean).join('/') || attrs.version || 'v1';
  const resource = attrs.subresource ? `${attrs.resource}/${attrs.subresource}` : attrs.resource;
  const namespace = attrs.namespace ? ` (${namespaceLabel}: ${attrs.namespace})` : '';

  return `${attrs.verb} ${api} ${resource}${namespace}`;
}

export default function PermissionDeniedAction({
  result,
  label,
  buttonStyle = 'action',
}: {
  result: AuthVisibleResult;
  label: string;
  buttonStyle?: ButtonStyle;
}) {
  const { t } = useTranslation(['translation', 'glossary']);
  const title = t("translation|Why can't I do this?");
  const detail =
    result.reason ||
    result.evaluationError ||
    t('translation|Kubernetes denied this SelfSubjectAccessReview.');
  const tooltip = `${title} ${formatAuthRequest(
    result.resourceAttributes,
    t('glossary|Namespace')
  )}. ${detail}`;

  if (buttonStyle === 'menu') {
    return (
      <Tooltip title={tooltip}>
        <span>
          <MenuItem disabled sx={{ color: 'text.secondary' }}>
            <ListItemIcon>
              <Icon icon="mdi:shield-alert" />
            </ListItemIcon>
            <ListItemText primary={label} secondary={title} />
          </MenuItem>
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton disabled aria-label={`${title} ${label}`} size="medium">
          <Icon icon="mdi:shield-alert" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
