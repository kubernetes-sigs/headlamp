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
import { Alert, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClusterSettings,
  DEFAULT_POD_DEBUG_IMAGE,
  loadClusterSettings,
  storeClusterSettings,
} from '../../../helpers/clusterSettings';
import { NameValueTable } from '../../common/NameValueTable';
import SectionBox from '../../common/SectionBox';

/**
 * Props for PodDebugSettings.
 *
 * @property {string} cluster - Cluster name for debug settings
 */
interface SettingsProps {
  cluster: string;
}

/**
 * Settings component for pod debugging with ephemeral containers.
 *
 * Allows enabling/disabling debugging and configuring the default debug image per cluster.
 * Settings persist to localStorage and take effect immediately.
 *
 * @param props - Cluster name
 * @returns Settings section with debug controls
 */
export default function PodDebugSettings(props: SettingsProps) {
  const { cluster } = props;
  const { t } = useTranslation(['translation']);
  const theme = useTheme();
  const [clusterSettings, setClusterSettings] = useState<ClusterSettings | null>(null);
  const [userImage, setUserImage] = useState('');
  const [userIsEnabled, setUserIsEnabled] = useState<boolean | null>(null);

  const podDebugLabelID = 'pod-debug-enabled-label';

  useEffect(() => {
    setClusterSettings(!!cluster ? loadClusterSettings(cluster) : null);
  }, [cluster]);

  useEffect(() => {
    if (clusterSettings?.podDebugTerminal?.debugImage !== userImage) {
      setUserImage(clusterSettings?.podDebugTerminal?.debugImage ?? '');
    }

    setUserIsEnabled(clusterSettings?.podDebugTerminal?.isEnabled ?? true);

    // Avoid re-initializing settings as {} just because the cluster is not yet set.
    if (clusterSettings !== null) {
      storeClusterSettings(cluster, clusterSettings);
    }
  }, [cluster, clusterSettings]);

  function isEditingImage() {
    return clusterSettings?.podDebugTerminal?.debugImage !== userImage;
  }

  const storeNewImage = useCallback(
    (image: string) => {
      let actualImage = image;
      if (image === DEFAULT_POD_DEBUG_IMAGE) {
        actualImage = '';
        setUserImage(actualImage);
      }

      setClusterSettings((settings: ClusterSettings | null) => {
        const newSettings = { ...(settings || {}) };
        if (newSettings.podDebugTerminal === null || newSettings.podDebugTerminal === undefined) {
          newSettings.podDebugTerminal = {};
        }
        newSettings.podDebugTerminal.debugImage = actualImage;

        return newSettings;
      });
    },
    [setClusterSettings, setUserImage]
  );

  function storeNewEnabled(enabled: boolean) {
    setUserIsEnabled(enabled);

    setClusterSettings((settings: ClusterSettings | null) => {
      const newSettings = { ...(settings || {}) };
      if (newSettings.podDebugTerminal === null || newSettings.podDebugTerminal === undefined) {
        newSettings.podDebugTerminal = {};
      }
      newSettings.podDebugTerminal.isEnabled = enabled;

      return newSettings;
    });
  }

  useEffect(() => {
    let timeoutHandle: NodeJS.Timeout | null = null;

    if (isEditingImage()) {
      // We store the image after a timeout.
      timeoutHandle = setTimeout(() => {
        storeNewImage(userImage);
      }, 1000);
    }

    return () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [userImage, isEditingImage, storeNewImage]);

  return (
    <SectionBox title={t('translation|Pod Debug Settings')} headerProps={{ headerStyle: 'label' }}>
      <NameValueTable
        rows={[
          {
            name: <Typography id={podDebugLabelID}>Enable Pod Debug</Typography>,
            value: (
              <Switch
                inputProps={{ 'aria-labelledby': podDebugLabelID }}
                checked={userIsEnabled ?? true}
                onChange={e => {
                  const newEnabled = e.target.checked;
                  storeNewEnabled(newEnabled);
                }}
              />
            ),
          },
          {
            name: 'Debug Image',
            value: (
              <TextField
                onChange={event => {
                  let value = event.target.value;
                  value = value.replace(' ', '');
                  setUserImage(value);
                }}
                value={userImage}
                placeholder={DEFAULT_POD_DEBUG_IMAGE}
                helperText={t(
                  'translation|The default image is used for creating ephemeral debug containers.'
                )}
                variant="outlined"
                size="small"
                InputProps={{
                  endAdornment: isEditingImage() ? (
                    <Icon
                      width={24}
                      color={theme.palette.text.secondary}
                      icon="mdi:progress-check"
                    />
                  ) : (
                    <Icon width={24} icon="mdi:check-bold" />
                  ),
                  sx: { maxWidth: 300 },
                }}
              />
            ),
          },
          {
            name: t('translation|Important Note'),
            value: (
              <Alert severity="info" sx={{ maxWidth: 400 }}>
                {t(
                  'translation|Ephemeral debug containers cannot be removed via Kubernetes API. They will remain in the pod specification even after the terminal closes. To remove them, the pod must be recreated.'
                )}
              </Alert>
            ),
          },
        ]}
      />
    </SectionBox>
  );
}
