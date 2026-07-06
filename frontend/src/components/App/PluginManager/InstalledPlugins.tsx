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

import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useTypedSelector } from '../../../redux/hooks';
import ActionButton from '../../common/ActionButton';
import { ConfirmDialog } from '../../common/Dialog';
import SimpleTable from '../../common/SimpleTable';
import { ManagerInfo, PluginSyncStatus, saveManagerState, withoutPlugin } from './api';

interface InstalledRow {
  name: string;
  version?: string;
  managed: boolean;
  loadedInBrowser: boolean;
  status?: PluginSyncStatus;
}

export interface InstalledPluginsProps {
  info: ManagerInfo;
  onChanged: () => void;
}

function SyncStatusChip(props: { status?: PluginSyncStatus; managed: boolean }) {
  const { status, managed } = props;
  const { t } = useTranslation(['translation']);

  if (!managed) {
    return <Chip size="small" label={t('translation|Unmanaged')} />;
  }
  if (!status) {
    return <Chip size="small" label={t('translation|Unknown')} />;
  }
  if (status.phase === 'synced') {
    return <Chip size="small" color="success" label={t('translation|Synced')} />;
  }
  if (status.phase === 'pending') {
    return <Chip size="small" color="warning" label={t('translation|Installing…')} />;
  }
  return (
    <Tooltip title={status.error || ''}>
      <Chip size="small" color="error" label={t('translation|Error')} />
    </Tooltip>
  );
}

export default function InstalledPlugins(props: InstalledPluginsProps) {
  const { info, onChanged } = props;
  const { t } = useTranslation(['translation']);
  const history = useHistory();
  const loadedPlugins = useTypedSelector(state => state.plugins.pluginSettings);
  const [pluginToUninstall, setPluginToUninstall] = useState<string | null>(null);
  const [error, setError] = useState('');

  const rows = useMemo(() => {
    const desired = info.state.plugins || [];
    const byName = new Map<string, InstalledRow>();

    for (const plugin of desired) {
      byName.set(plugin.name, {
        name: plugin.name,
        version: plugin.version,
        managed: true,
        loadedInBrowser: false,
        status: info.status.plugins[plugin.name],
      });
    }

    for (const plugin of loadedPlugins) {
      const existing = byName.get(plugin.name);
      if (existing) {
        existing.loadedInBrowser = true;
      } else {
        byName.set(plugin.name, {
          name: plugin.name,
          version: plugin.version,
          managed: false,
          loadedInBrowser: true,
        });
      }
    }

    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [info, loadedPlugins]);

  async function uninstall(name: string) {
    setError('');
    try {
      await saveManagerState(info, withoutPlugin(info.state, name));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      {!!error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: (row: InstalledRow) => row.name,
            sort: true,
          },
          {
            label: t('translation|Version'),
            getter: (row: InstalledRow) => row.version || '-',
          },
          {
            label: t('translation|Status'),
            getter: (row: InstalledRow) => (
              <SyncStatusChip status={row.status} managed={row.managed} />
            ),
          },
          {
            label: t('translation|Actions'),
            getter: (row: InstalledRow) => (
              <>
                {row.loadedInBrowser && (
                  <ActionButton
                    description={t('translation|Settings')}
                    icon="mdi:cog"
                    onClick={() =>
                      history.push(`/settings/plugins/${encodeURIComponent(row.name)}`)
                    }
                  />
                )}
                {row.managed && (
                  <ActionButton
                    description={t('translation|Uninstall')}
                    icon="mdi:delete"
                    onClick={() => setPluginToUninstall(row.name)}
                  />
                )}
              </>
            ),
          },
        ]}
        data={rows}
        emptyMessage={t('translation|No plugins installed')}
      />
      <ConfirmDialog
        open={pluginToUninstall !== null}
        title={t('translation|Uninstall plugin')}
        description={t(
          'translation|Are you sure you want to uninstall {{ name }} from all Headlamp replicas?',
          { name: pluginToUninstall }
        )}
        handleClose={() => setPluginToUninstall(null)}
        onConfirm={() => {
          if (pluginToUninstall) {
            uninstall(pluginToUninstall);
          }
          setPluginToUninstall(null);
        }}
      />
    </>
  );
}
