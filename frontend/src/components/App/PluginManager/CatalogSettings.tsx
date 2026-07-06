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
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ActionButton from '../../common/ActionButton';
import { ConfirmDialog, Dialog } from '../../common/Dialog';
import SimpleTable from '../../common/SimpleTable';
import { ManagerInfo, PluginCatalog, saveManagerState, withCatalog, withoutCatalog } from './api';

export interface CatalogSettingsProps {
  info: ManagerInfo;
  onChanged: () => void;
}

const ARTIFACT_HUB: PluginCatalog = {
  id: 'artifacthub',
  name: 'Artifact Hub',
  type: 'artifacthub',
  url: 'https://artifacthub.io',
};

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '') || 'catalog'
  );
}

interface CatalogDialogProps {
  open: boolean;
  catalog: PluginCatalog | null;
  onClose: () => void;
  onSave: (catalog: PluginCatalog) => void;
}

function CatalogDialog(props: CatalogDialogProps) {
  const { open, catalog, onClose, onSave } = props;
  const { t } = useTranslation(['translation']);
  const [name, setName] = useState(catalog?.name || '');
  const [type, setType] = useState<PluginCatalog['type']>(catalog?.type || 'index');
  const [url, setUrl] = useState(catalog?.url || '');

  const valid = name.trim() !== '' && /^https?:\/\/.+/.test(url);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={catalog ? t('translation|Edit Catalog') : t('translation|Add Catalog')}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, minWidth: 400 }}>
        <TextField
          label={t('translation|Name')}
          value={name}
          onChange={event => setName(event.target.value)}
        />
        <TextField
          select
          label={t('translation|Type')}
          value={type}
          onChange={event => setType(event.target.value as PluginCatalog['type'])}
        >
          <MenuItem value="artifacthub">{t('translation|Artifact Hub')}</MenuItem>
          <MenuItem value="index">
            {t('translation|Static index (e.g. Nexus OSS raw/hosted)')}
          </MenuItem>
        </TextField>
        <TextField
          label={t('translation|URL')}
          value={url}
          onChange={event => setUrl(event.target.value)}
          helperText={
            type === 'index'
              ? t('translation|URL of an index.json file listing the plugins')
              : t('translation|Base URL of the Artifact Hub instance')
          }
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button onClick={onClose}>{t('translation|Cancel')}</Button>
          <Button
            variant="contained"
            disabled={!valid}
            onClick={() =>
              onSave({
                id: catalog?.id || slugify(name),
                name: name.trim(),
                type,
                url: url.trim(),
              })
            }
          >
            {t('translation|Save')}
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}

export default function CatalogSettings(props: CatalogSettingsProps) {
  const { info, onChanged } = props;
  const { t } = useTranslation(['translation']);
  const catalogs = info.state.catalogs || [];
  const [dialogCatalog, setDialogCatalog] = useState<PluginCatalog | null | undefined>(undefined);
  const [catalogToDelete, setCatalogToDelete] = useState<PluginCatalog | null>(null);
  const [error, setError] = useState('');

  async function save(state: Parameters<typeof saveManagerState>[1]) {
    setError('');
    try {
      await saveManagerState(info, state);
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
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button variant="contained" onClick={() => setDialogCatalog(null)}>
          {t('translation|Add Catalog')}
        </Button>
        {!catalogs.some(catalog => catalog.id === ARTIFACT_HUB.id) && (
          <Button variant="outlined" onClick={() => save(withCatalog(info.state, ARTIFACT_HUB))}>
            {t('translation|Add Artifact Hub')}
          </Button>
        )}
      </Box>
      <SimpleTable
        columns={[
          {
            label: t('translation|Name'),
            getter: (catalog: PluginCatalog) => catalog.name || catalog.id,
          },
          {
            label: t('translation|Type'),
            getter: (catalog: PluginCatalog) =>
              catalog.type === 'artifacthub'
                ? t('translation|Artifact Hub')
                : t('translation|Static index'),
          },
          {
            label: t('translation|URL'),
            getter: (catalog: PluginCatalog) => catalog.url,
          },
          {
            label: t('translation|Actions'),
            getter: (catalog: PluginCatalog) => (
              <>
                <ActionButton
                  description={t('translation|Edit')}
                  icon="mdi:pencil"
                  onClick={() => setDialogCatalog(catalog)}
                />
                <ActionButton
                  description={t('translation|Delete')}
                  icon="mdi:delete"
                  onClick={() => setCatalogToDelete(catalog)}
                />
              </>
            ),
          },
        ]}
        data={catalogs}
        emptyMessage={t('translation|No catalogs configured')}
      />
      {dialogCatalog !== undefined && (
        <CatalogDialog
          open
          catalog={dialogCatalog}
          onClose={() => setDialogCatalog(undefined)}
          onSave={catalog => {
            setDialogCatalog(undefined);
            save(withCatalog(info.state, catalog));
          }}
        />
      )}
      <ConfirmDialog
        open={catalogToDelete !== null}
        title={t('translation|Delete catalog')}
        description={t('translation|Are you sure you want to delete the catalog {{ name }}?', {
          name: catalogToDelete?.name || catalogToDelete?.id,
        })}
        handleClose={() => setCatalogToDelete(null)}
        onConfirm={() => {
          if (catalogToDelete) {
            save(withoutCatalog(info.state, catalogToDelete.id));
          }
          setCatalogToDelete(null);
        }}
      />
    </>
  );
}
