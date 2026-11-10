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

import { Headlamp, registerRoute, registerSidebarEntry } from '@kinvolk/headlamp-plugin/lib';
import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';

/** Result returned by a plugin secure-storage operation. */
interface SecureStorageResult {
  /** Whether the operation completed successfully. */
  success: boolean;
  /** The loaded value, or null when the key does not exist. */
  value?: string | null;
  /** A stable error description when the operation fails. */
  error?: string;
}

/** Encrypted key/value operations scoped to this plugin installation. */
interface PluginSecureStorage {
  /** Encrypts and saves a value under a plugin-local key. */
  save(key: string, value: string): Promise<SecureStorageResult>;
  /** Loads and decrypts a value saved under a plugin-local key. */
  load(key: string): Promise<SecureStorageResult>;
  /** Deletes a value saved under a plugin-local key. */
  delete(key: string): Promise<SecureStorageResult>;
}

// Headlamp injects this private argument when it runs a plugin in the desktop app.
declare const pluginSecureStorage: PluginSecureStorage;

const STORAGE_KEY = 'example-credential';

function SecureStorageExample() {
  const [value, setValue] = React.useState('');
  const [loadedValue, setLoadedValue] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('No operation has run.');

  const saveValue = async () => {
    const result = await pluginSecureStorage.save(STORAGE_KEY, value);
    setStatus(result.success ? 'Value encrypted and saved.' : `Save failed: ${result.error}`);
  };

  const loadValue = async () => {
    const result = await pluginSecureStorage.load(STORAGE_KEY);
    if (!result.success) {
      setStatus(`Load failed: ${result.error}`);
      return;
    }

    setLoadedValue(result.value ?? null);
    setStatus(result.value === null ? 'No value is stored.' : 'Value loaded and decrypted.');
  };

  const deleteValue = async () => {
    const result = await pluginSecureStorage.delete(STORAGE_KEY);
    if (result.success) {
      setLoadedValue(null);
      setStatus('Stored value deleted.');
      return;
    }
    setStatus(`Delete failed: ${result.error}`);
  };

  return (
    <SectionBox title="Plugin Secure Storage">
      <Stack spacing={2} maxWidth={520}>
        <Typography>
          This sample value is encrypted on this computer and isolated to this plugin installation.
        </Typography>
        <TextField
          label="Sample credential"
          type="password"
          value={value}
          onChange={event => setValue(event.target.value)}
        />
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={!value} onClick={saveValue}>
            Save
          </Button>
          <Button variant="outlined" onClick={loadValue}>
            Load
          </Button>
          <Button color="error" variant="outlined" onClick={deleteValue}>
            Delete
          </Button>
        </Stack>
        <Typography role="status">{status}</Typography>
        {loadedValue !== null && (
          <Typography>
            Loaded value: <code>{loadedValue}</code>
          </Typography>
        )}
      </Stack>
    </SectionBox>
  );
}

if (Headlamp.isRunningAsApp()) {
  registerSidebarEntry({
    name: 'secure-storage-example',
    label: 'Secure Storage',
    url: '/secure-storage-example',
    icon: 'mdi:shield-key',
    sidebar: 'HOME',
  });

  registerRoute({
    path: '/secure-storage-example',
    sidebar: 'secure-storage-example',
    useClusterURL: false,
    noAuthRequired: true,
    name: 'secure-storage-example',
    exact: true,
    component: SecureStorageExample,
  });
}
