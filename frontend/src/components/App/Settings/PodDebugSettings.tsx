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

import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ClusterSettings, DEFAULT_POD_DEBUG_IMAGE } from '../../../helpers/clusterSettings';
import { useTypedSelector } from '../../../redux/hooks';
import { useSetting } from '../../../settings/useAdminSettings';
import { HoverInfoLabel } from '../../common/Label';
import { NameValueTable } from '../../common/NameValueTable';
import SectionBox from '../../common/SectionBox';

/**
 * Props for PodDebugSettings.
 *
 * @property {string} cluster - Cluster name for debug settings
 * @property {ClusterSettings} clusterSettings - Shared cluster settings state
 * @property {Function} setClusterSettings - Setter for shared cluster settings state
 */
interface SettingsProps {
  cluster: string;
  clusterSettings: ClusterSettings;
  setClusterSettings: React.Dispatch<React.SetStateAction<ClusterSettings>>;
}

/**
 * Settings for pod debugging with ephemeral containers.
 *
 * Allows enabling/disabling debugging and configuring the default debug image per cluster.
 */
export default function PodDebugSettings(props: SettingsProps) {
  const { cluster, clusterSettings, setClusterSettings } = props;
  const { t } = useTranslation(['translation']);
  const defaultPodDebugImage =
    useTypedSelector(state => state.config?.defaultPodDebugImage) || DEFAULT_POD_DEBUG_IMAGE;

  const podDebugLabelID = 'pod-debug-enabled-label';
  const debugImageLabelID = 'debug-image-label';

  const adminDebugImage = useSetting<string>('clusters.*.podDebugTerminal.debugImage', cluster);
  const adminIsEnabled = useSetting<boolean>('clusters.*.podDebugTerminal.isEnabled', cluster);

  const image =
    adminDebugImage.disabled || adminDebugImage.hidden
      ? adminDebugImage.value ?? ''
      : clusterSettings.podDebugTerminal?.debugImage || adminDebugImage.value || '';
  const isEnabled =
    adminIsEnabled.disabled || adminIsEnabled.hidden
      ? adminIsEnabled.value ?? true
      : clusterSettings.podDebugTerminal?.isEnabled ?? adminIsEnabled.value ?? true;

  function updatePodDebug(patch: Partial<ClusterSettings['podDebugTerminal']>) {
    setClusterSettings(settings => ({
      ...settings,
      podDebugTerminal: { ...settings.podDebugTerminal, ...patch },
    }));
  }

  return (
    <SectionBox title={t('translation|Pod Debug Settings')} headerProps={{ headerStyle: 'label' }}>
      <NameValueTable
        rows={[
          {
            name: (
              <HoverInfoLabel
                label={<span id={podDebugLabelID}>{t('translation|Enable Pod Debug')}</span>}
                hoverInfo={t(
                  'translation|Ephemeral debug containers cannot be removed via Kubernetes API. They will remain in the pod specification even after the terminal closes. To remove them, the pod must be recreated.'
                )}
              />
            ),
            hide: adminIsEnabled.hidden,
            value: (
              <Switch
                inputProps={{ 'aria-labelledby': podDebugLabelID }}
                checked={isEnabled}
                onChange={e => updatePodDebug({ isEnabled: e.target.checked })}
                disabled={adminIsEnabled.disabled}
              />
            ),
          },
          {
            name: <span id={debugImageLabelID}>{t('translation|Debug Image')}</span>,
            hide: adminDebugImage.hidden,
            value: (
              <TextField
                onChange={event => {
                  const value = event.target.value.replace(/\s/g, '');
                  updatePodDebug({ debugImage: value });
                }}
                value={image}
                disabled={adminDebugImage.disabled}
                placeholder={defaultPodDebugImage}
                inputProps={{
                  'aria-labelledby': debugImageLabelID,
                }}
                helperText={t(
                  'translation|The default image is used for creating ephemeral debug containers.'
                )}
                variant="outlined"
                size="small"
                InputProps={{
                  sx: { maxWidth: 300 },
                }}
              />
            ),
          },
        ]}
      />
    </SectionBox>
  );
}
