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

import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import { registerOAuthProvider } from '../../electron/oauthProvider';
import { createProtocolHandler } from '../../electron/protocolHandler';

const callbackUrl = process.env.HEADLAMP_OAUTH_CALLBACK_URL;
const outputPath = process.env.HEADLAMP_OAUTH_OUTPUT_PATH;
const protocolScheme = process.env.HEADLAMP_OAUTH_PROTOCOL_SCHEME;
let fixtureWindow: BrowserWindow;

if (!callbackUrl || !outputPath || !protocolScheme) {
  throw new Error('OAuth provider e2e fixture requires callback configuration');
}

const protocolHandler = createProtocolHandler({
  protocolScheme,
  startUrl: 'data:text/html,<title>OAuth provider fixture</title>',
  getMainWindow: () => fixtureWindow,
});

app.emit('open-url', { preventDefault() {} } as Electron.Event, callbackUrl);

app.whenReady().then(async () => {
  fixtureWindow = new BrowserWindow({ show: false });
  await fixtureWindow.loadURL('data:text/html,<title>OAuth provider fixture</title>');
  registerOAuthProvider({
    id: 'e2e-provider',
    callback: { hostname: 'oauth', pathname: '/callback' },
    handleCallback(url) {
      fs.writeFileSync(outputPath, url.href);
    },
  });
  protocolHandler.setReady();
});
