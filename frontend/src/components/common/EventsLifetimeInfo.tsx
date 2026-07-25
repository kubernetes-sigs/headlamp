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
import { useTranslation } from 'react-i18next';
import { LightTooltip } from './Tooltip';

export default function EventsLifetimeInfo() {
  const { t } = useTranslation('translation');
  return (
    <LightTooltip
      title={t(
        "translation|Kubernetes events have a lifetime of 1 hour by default. This duration may vary depending on your cluster's configuration."
      )}
      interactive
    >
      <IconButton
        aria-label={t('translation|Events lifetime information')}
        size="small"
        sx={{
          fontSize: '1.75rem',
          verticalAlign: 'middle',
          mr: 1,
        }}
      >
        <Icon icon="mdi:information-outline" />
      </IconButton>
    </LightTooltip>
  );
}
