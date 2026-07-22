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

import { Typography } from '@mui/material';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClusterSettings,
  DEFAULT_NODE_SHELL_LINUX_IMAGE,
  DEFAULT_NODE_SHELL_NAMESPACE,
} from '../../../helpers/clusterSettings';
import { useSetting } from '../../../helpers/useAdminSettings';
import { useTypedSelector } from '../../../redux/hooks';
import { NameValueTable } from '../../common/NameValueTable';
import SectionBox from '../../common/SectionBox';
import { isValidNamespaceFormat } from './util';

interface SettingsProps {
  cluster: string;
  clusterSettings: ClusterSettings;
  setClusterSettings: React.Dispatch<React.SetStateAction<ClusterSettings>>;
}

export default function NodeShellSettings(props: SettingsProps) {
  const { cluster, clusterSettings, setClusterSettings } = props;
  const { t } = useTranslation(['translation']);
  const defaultNodeShellImage =
    useTypedSelector(state => state.config?.defaultNodeShellImage) ||
    DEFAULT_NODE_SHELL_LINUX_IMAGE;
  const defaultNodeShellNamespace =
    useTypedSelector(state => state.config?.defaultNodeShellNamespace) ||
    DEFAULT_NODE_SHELL_NAMESPACE;

  const nodeShellLabelID = 'node-shell-enabled-label';

  const adminLinuxImage = useSetting<string>('clusters.*.nodeShellTerminal.linuxImage', cluster);
  const adminIsEnabled = useSetting<boolean>('clusters.*.nodeShellTerminal.isEnabled', cluster);

  const namespace = clusterSettings.nodeShellTerminal?.namespace ?? '';
  // When a setting is admin-managed (disabled or hidden) the admin value is
  // forced; otherwise the user's cluster setting wins, falling back to the
  // admin-provided default.
  const image =
    adminLinuxImage.disabled || adminLinuxImage.hidden
      ? adminLinuxImage.value ?? ''
      : clusterSettings.nodeShellTerminal?.linuxImage ?? adminLinuxImage.value ?? '';
  const isEnabled =
    adminIsEnabled.disabled || adminIsEnabled.hidden
      ? adminIsEnabled.value ?? true
      : clusterSettings.nodeShellTerminal?.isEnabled ?? adminIsEnabled.value ?? true;

  const [namespaceInput, setNamespaceInput] = React.useState(namespace);
  React.useEffect(() => {
    setNamespaceInput(namespace);
  }, [namespace]);

  const isValidNamespace = isValidNamespaceFormat(namespaceInput);
  const invalidNamespaceMessage = t(
    "translation|Namespaces must contain only lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character."
  );

  function updateNodeShell(patch: Partial<ClusterSettings['nodeShellTerminal']>) {
    setClusterSettings(settings => ({
      ...settings,
      nodeShellTerminal: { ...settings.nodeShellTerminal, ...patch },
    }));
  }

  return (
    <SectionBox title={t('translation|Node Shell Settings')} headerProps={{ headerStyle: 'label' }}>
      <NameValueTable
        rows={[
          {
            name: <Typography id={nodeShellLabelID}>Enable Node Shell</Typography>,
            hide: adminIsEnabled.hidden,
            value: (
              <Switch
                inputProps={{ 'aria-labelledby': nodeShellLabelID }}
                checked={isEnabled}
                onChange={e => updateNodeShell({ isEnabled: e.target.checked })}
                disabled={adminIsEnabled.disabled}
              />
            ),
          },
          {
            name: 'Linux Image',
            hide: adminLinuxImage.hidden,
            value: (
              <TextField
                onChange={event => {
                  const value = event.target.value.replace(' ', '');
                  updateNodeShell({ linuxImage: value });
                }}
                value={image}
                disabled={adminLinuxImage.disabled}
                placeholder={defaultNodeShellImage}
                helperText={t(
                  'translation|The default image is used for dropping a shell into a node (when not specified directly).'
                )}
                variant="outlined"
                size="small"
                inputProps={{
                  'aria-label': t('translation|Linux image'),
                }}
                InputProps={{
                  sx: { maxWidth: 300 },
                }}
              />
            ),
          },
          {
            name: 'Namespace',
            value: (
              <TextField
                onChange={event => {
                  const value = event.target.value.replace(' ', '');
                  setNamespaceInput(value);
                  if (isValidNamespaceFormat(value) || value === '') {
                    updateNodeShell({ namespace: value });
                  }
                }}
                value={namespaceInput}
                placeholder={defaultNodeShellNamespace}
                error={!isValidNamespace}
                helperText={
                  isValidNamespace
                    ? t('translation|The default namespace is {{ namespace }}.', {
                        namespace: defaultNodeShellNamespace,
                      })
                    : invalidNamespaceMessage
                }
                variant="outlined"
                size="small"
                inputProps={{
                  'aria-label': t('translation|Namespace'),
                }}
                InputProps={{
                  sx: { maxWidth: 250 },
                }}
              />
            ),
          },
        ]}
      />
    </SectionBox>
  );
}
