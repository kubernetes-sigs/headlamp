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
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ActionButton from '../../common/ActionButton';
import { ConfirmDialog, Dialog } from '../../common/Dialog';
import SimpleTable from '../../common/SimpleTable';
import {
  deleteCatalogSecret,
  ManagerInfo,
  PluginCatalog,
  probeIndex,
  saveCatalogSecret,
  saveManagerState,
  withCatalog,
  withoutCatalog,
} from './api';

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

// slugify builds a DNS-1123 label (max 63 chars) so the id is safe to embed
// in a Secret name.
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, 63)
      .replace(/-+$/, '') || 'catalog'
  );
}

interface CatalogDialogProps {
  open: boolean;
  info: ManagerInfo;
  catalog: PluginCatalog | null;
  onClose: () => void;
  onSaved: (catalog: PluginCatalog) => void;
}

/** Ensures an index URL points at a .json file, appending /index.json if not. */
function normalizeIndexUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  return /\.json$/i.test(trimmed) ? trimmed : `${trimmed}/index.json`;
}

function CatalogDialog(props: CatalogDialogProps) {
  const { open, info, catalog, onClose, onSaved } = props;
  const { t } = useTranslation(['translation']);
  const [name, setName] = useState(catalog?.name || '');
  const [type, setType] = useState<PluginCatalog['type']>(catalog?.type || 'index');
  const [url, setUrl] = useState(catalog?.url || '');
  const [insecure, setInsecure] = useState(catalog?.insecureSkipTlsVerify || false);
  const [caCert, setCaCert] = useState(catalog?.caCert || '');
  const [certError, setCertError] = useState('');
  const [authEnabled, setAuthEnabled] = useState(!!catalog?.username || !!catalog?.passwordSecret);
  const [username, setUsername] = useState(catalog?.username || '');
  const [password, setPassword] = useState('');
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const hadSecret = !!catalog?.passwordSecret;
  const isHTTPS = /^https:\/\//i.test(url.trim());
  // With auth enabled, a username plus either a new password or an already
  // stored secret is required; otherwise browsing the catalog fails later.
  const authValid = !authEnabled || (username.trim() !== '' && (password !== '' || hadSecret));
  const valid = name.trim() !== '' && /^https?:\/\/.+/.test(url) && authValid;

  async function onCertFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const text = await file.text();
    if (!text.includes('BEGIN CERTIFICATE')) {
      setCertError(t('translation|That file is not a PEM certificate.'));
      return;
    }
    setCertError('');
    setCaCert(text);
  }

  async function onSearchIndex() {
    setProbing(true);
    setError('');
    try {
      const found = await probeIndex({
        url: url.trim(),
        insecureSkipTlsVerify: isHTTPS && insecure,
        caCert: isHTTPS && !insecure ? caCert.trim() || undefined : undefined,
        username: authEnabled ? username.trim() || undefined : undefined,
        password: authEnabled ? password || undefined : undefined,
      });
      setUrl(found);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProbing(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setError('');
    try {
      const id = catalog?.id || slugify(name);
      const finalUrl = type === 'index' ? normalizeIndexUrl(url) : url.trim();

      let passwordSecret: string | undefined;
      if (authEnabled) {
        if (password !== '') {
          passwordSecret = await saveCatalogSecret(info, id, password);
        } else if (hadSecret) {
          passwordSecret = catalog?.passwordSecret;
        }
      } else if (hadSecret) {
        await deleteCatalogSecret(info, id);
      }

      onSaved({
        id,
        name: name.trim(),
        type,
        url: finalUrl,
        insecureSkipTlsVerify: isHTTPS && insecure ? true : undefined,
        caCert: isHTTPS && !insecure && caCert.trim() !== '' ? caCert.trim() : undefined,
        username: authEnabled && username.trim() !== '' ? username.trim() : undefined,
        passwordSecret,
      });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={catalog ? t('translation|Edit Catalog') : t('translation|Add Catalog')}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, minWidth: 420 }}>
        {!!error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}
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
              ? t('translation|Repository or index.json URL; /index.json is added if missing')
              : t('translation|Base URL of the Artifact Hub instance')
          }
        />
        {type === 'index' && (
          <Box>
            <Button
              size="small"
              disabled={!isHTTPS && !/^http:\/\//i.test(url.trim())}
              onClick={onSearchIndex}
            >
              {probing ? t('translation|Searching…') : t('translation|Search for index')}
            </Button>
          </Box>
        )}
        {isHTTPS && (
          <>
            <FormControlLabel
              control={
                <Checkbox
                  checked={insecure}
                  onChange={event => setInsecure(event.target.checked)}
                />
              }
              label={t('translation|Ignore TLS certificate warnings (insecure)')}
            />
            <TextField
              label={t('translation|CA certificate (PEM)')}
              value={caCert}
              onChange={event => setCaCert(event.target.value)}
              multiline
              minRows={2}
              maxRows={6}
              disabled={insecure}
              error={certError !== ''}
              helperText={
                certError || t('translation|Trust a self-signed certificate, e.g. your Nexus CA.')
              }
              sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8em' } }}
            />
            <Box>
              <Button size="small" disabled={insecure} onClick={() => fileInput.current?.click()}>
                {t('translation|Upload certificate…')}
              </Button>
              {caCert !== '' && (
                <Button size="small" color="secondary" onClick={() => setCaCert('')}>
                  {t('translation|Clear')}
                </Button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept=".pem,.crt,.cer,.cert"
                hidden
                onChange={onCertFile}
              />
            </Box>
          </>
        )}
        <FormControlLabel
          control={
            <Checkbox
              checked={authEnabled}
              onChange={event => setAuthEnabled(event.target.checked)}
            />
          }
          label={t('translation|Requires authentication (username / password)')}
        />
        {authEnabled && (
          <>
            <TextField
              label={t('translation|Username')}
              value={username}
              onChange={event => setUsername(event.target.value)}
            />
            <TextField
              label={t('translation|Password')}
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder={hadSecret ? t('translation|Unchanged') : ''}
              helperText={
                hadSecret
                  ? t('translation|Leave blank to keep the stored password.')
                  : t('translation|Stored in a Kubernetes Secret, not in the ConfigMap.')
              }
            />
          </>
        )}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, alignItems: 'center' }}>
          {saving && <CircularProgress size={20} />}
          <Button onClick={onClose} disabled={saving}>
            {t('translation|Cancel')}
          </Button>
          <Button variant="contained" disabled={!valid || saving || probing} onClick={onSave}>
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
            label: t('translation|TLS'),
            getter: (catalog: PluginCatalog) =>
              catalog.insecureSkipTlsVerify
                ? t('translation|Insecure (verification off)')
                : catalog.caCert
                ? t('translation|Custom CA')
                : '-',
          },
          {
            label: t('translation|Auth'),
            getter: (catalog: PluginCatalog) =>
              catalog.username
                ? t('translation|Basic ({{ user }})', { user: catalog.username })
                : '-',
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
          info={info}
          catalog={dialogCatalog}
          onClose={() => setDialogCatalog(undefined)}
          onSaved={catalog => {
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
        onConfirm={async () => {
          const target = catalogToDelete;
          setCatalogToDelete(null);
          if (!target) {
            return;
          }
          if (target.passwordSecret) {
            try {
              await deleteCatalogSecret(info, target.id);
            } catch (err) {
              setError((err as Error).message);
            }
          }
          await save(withoutCatalog(info.state, target.id));
        }}
      />
    </>
  );
}
