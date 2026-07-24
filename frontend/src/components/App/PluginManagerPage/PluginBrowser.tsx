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
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SimpleTable from '../../common/SimpleTable';
import {
  CatalogEntry,
  ManagerInfo,
  resolvePlugin,
  saveManagerState,
  searchCatalogAll,
  withPlugin,
} from './api';

export interface PluginBrowserProps {
  info: ManagerInfo;
  onChanged: () => void;
}

export default function PluginBrowser(props: PluginBrowserProps) {
  const { info, onChanged } = props;
  const { t } = useTranslation(['translation']);
  const catalogs = useMemo(() => info.state.catalogs || [], [info]);
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id || '');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState('');

  const installedVersions = useMemo(() => {
    const versions = new Map<string, string>();
    for (const plugin of info.state.plugins || []) {
      versions.set(plugin.name, plugin.version);
    }
    return versions;
  }, [info]);

  async function search(catalog: string, searchQuery: string) {
    if (!catalog) {
      return;
    }
    setSearching(true);
    setError('');
    try {
      setEntries(await searchCatalogAll(catalog, searchQuery));
    } catch (err) {
      setEntries([]);
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  // Keep the selection valid: pick the first catalog when none is selected or
  // the selected one was removed, and clear it when no catalogs are left.
  useEffect(() => {
    if (!catalogs.some(catalog => catalog.id === catalogId)) {
      setCatalogId(catalogs[0]?.id || '');
    }
  }, [catalogs, catalogId]);

  useEffect(() => {
    if (!catalogId) {
      setEntries([]);
      return;
    }
    search(catalogId, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogId]);

  async function install(entry: CatalogEntry) {
    setInstalling(entry.name);
    setError('');
    try {
      const resolved = await resolvePlugin(catalogId, entry);
      await saveManagerState(
        info,
        withPlugin(info.state, {
          name: resolved.name,
          version: resolved.version,
          archiveUrl: resolved.archiveUrl,
          checksum: resolved.checksum,
          catalog: catalogId,
          source: resolved.source || entry.source,
        })
      );
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInstalling(null);
    }
  }

  if (catalogs.length === 0) {
    return (
      <Alert severity="info">
        {t('translation|No catalogs configured. Add one in the Catalog Settings tab first.')}
      </Alert>
    );
  }

  return (
    <>
      {!!error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label={t('translation|Catalog')}
          value={catalogId}
          onChange={event => setCatalogId(event.target.value)}
          sx={{ minWidth: 200 }}
        >
          {catalogs.map(catalog => (
            <MenuItem key={catalog.id} value={catalog.id}>
              {catalog.name || catalog.id}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label={t('translation|Search plugins')}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              search(catalogId, query);
            }
          }}
          sx={{ flexGrow: 1 }}
        />
        <Button variant="contained" onClick={() => search(catalogId, query)} disabled={searching}>
          {t('translation|Search')}
        </Button>
        {searching && <CircularProgress size={24} />}
      </Box>
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: (entry: CatalogEntry) =>
              entry.source ? (
                <Link href={entry.source} target="_blank" rel="noreferrer">
                  {entry.displayName || entry.name}
                </Link>
              ) : (
                entry.displayName || entry.name
              ),
          },
          {
            label: t('translation|Description'),
            getter: (entry: CatalogEntry) => entry.description || '-',
          },
          {
            label: t('translation|Version'),
            getter: (entry: CatalogEntry) => entry.version,
          },
          {
            label: '',
            getter: (entry: CatalogEntry) => {
              const installedVersion = installedVersions.get(entry.name);
              const isCurrent = installedVersion === entry.version;
              return (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={isCurrent || installing !== null}
                  onClick={() => install(entry)}
                >
                  {installing === entry.name
                    ? t('translation|Installing…')
                    : isCurrent
                    ? t('translation|Installed')
                    : installedVersion
                    ? t('translation|Update')
                    : t('translation|Install')}
                </Button>
              );
            },
          },
        ]}
        data={entries}
        emptyMessage={t('translation|No plugins found')}
      />
    </>
  );
}
