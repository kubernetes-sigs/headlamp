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

import { app, BrowserWindow, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupSecureStorageHandlers } from '../../electron/secureStorage';

const profile = process.env.HEADLAMP_STORAGE_TEST_PROFILE;
const preload = process.env.HEADLAMP_STORAGE_TEST_PRELOAD;
const page = process.env.HEADLAMP_STORAGE_TEST_PAGE;
if (!profile || !preload || !page) throw new Error('Missing secure-storage fixture paths');

app.setPath('userData', profile);
void app.whenReady().then(async () => {
  const storagePath = path.join(profile, 'secure-storage.json');
  if (!fs.existsSync(storagePath) && safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(
      storagePath,
      JSON.stringify({
        'aks-desktop:github-auth': safeStorage
          .encryptString('synthetic-refresh-token')
          .toString('base64'),
      }),
      { mode: 0o600 }
    );
  }
  const window = new BrowserWindow({
    show: false,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const url = pathToFileURL(page).href;
  setupSecureStorageHandlers(window, url);
  await window.loadURL(url);
});
app.on('window-all-closed', () => app.quit());
