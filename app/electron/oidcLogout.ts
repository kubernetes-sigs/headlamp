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

/*
 * Copyright 2026 The Kubernetes Authors
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

import { BrowserWindow } from 'electron';

/** Allows provider navigation without exposing desktop APIs or opening external protocols. */
export function isOIDCLogoutNavigation(url: URL, backendOrigin: string): boolean {
  return (
    !url.username &&
    !url.password &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        (url.origin === backendOrigin ||
          url.hostname === 'localhost' ||
          url.hostname === '[::1]' ||
          /^127\.\d+\.\d+\.\d+$/.test(url.hostname))))
  );
}

/** Initiates logout in the backend session and follows redirects in an unprivileged window. */
export async function openOIDCLogout(
  parent: BrowserWindow,
  backendOrigin: string,
  backendToken: string,
  cluster: unknown
): Promise<void> {
  if (typeof cluster !== 'string' || !cluster || cluster.length > 4096) {
    throw new Error('Invalid OIDC logout cluster');
  }
  const clusterPath = `/encoded-clusters/${Buffer.from(cluster).toString('base64url')}`;
  const response = await parent.webContents.session.fetch(
    `${backendOrigin}${clusterPath}/oidc-logout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-HEADLAMP_BACKEND-TOKEN': backendToken,
      },
      credentials: 'include',
      redirect: 'error',
    }
  );
  if (!response.ok) {
    throw new Error(`OIDC logout failed (HTTP ${response.status})`);
  }
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('redirectURL' in result) ||
    typeof result.redirectURL !== 'string'
  ) {
    throw new Error('Invalid OIDC logout redirect');
  }
  const redirect = new URL(result.redirectURL, backendOrigin);
  if (!isOIDCLogoutNavigation(redirect, backendOrigin)) {
    throw new Error('Invalid OIDC logout redirect protocol');
  }
  if (
    redirect.origin === backendOrigin &&
    (redirect.pathname === '/' || redirect.pathname === `${clusterPath}/login`)
  ) {
    return;
  }
  const popup = new BrowserWindow({
    parent,
    width: 800,
    height: 600,
    webPreferences: {
      session: parent.webContents.session,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  let returnedToApp = false;
  const validateNavigation = (event: Electron.Event, target: string) => {
    const url = new URL(target);
    if (!isOIDCLogoutNavigation(url, backendOrigin)) {
      event.preventDefault();
      popup.close();
      return;
    }
    if (
      url.origin === backendOrigin &&
      (url.pathname === '/' || url.pathname === `${clusterPath}/login`)
    ) {
      returnedToApp = true;
      event.preventDefault();
      popup.close();
    }
  };
  popup.webContents.on('will-navigate', validateNavigation);
  popup.webContents.on('will-redirect', validateNavigation);
  const timeout = setTimeout(() => popup.close(), 2 * 60 * 1000);
  popup.on('closed', () => clearTimeout(timeout));
  try {
    await popup.loadURL(redirect.href);
  } catch (error) {
    if (returnedToApp) {
      return;
    }
    if (!popup.isDestroyed()) {
      popup.close();
      throw error;
    }
  }
}
