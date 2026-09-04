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

import { BrowserWindow, dialog, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import i18n from './i18next.config';
import { revokeRunCmdCapabilities } from './runCmd';
import { areDevelopmentPluginsEnabled, setDevelopmentPluginsEnabled } from './settings';

type DevelopmentPluginsIpcListeners = {
  requestDevelopmentPlugins: (event: IpcMainEvent) => void;
  setDevelopmentPlugins: (event: IpcMainEvent, enabled: boolean) => void;
  getDevelopmentPlugins: (event: IpcMainInvokeEvent) => boolean;
};

const developmentPluginsIpcListeners = new WeakMap<IpcMain, DevelopmentPluginsIpcListeners>();

/**
 * Asks the user to confirm that locally developed plugins may run in the packaged app.
 *
 * Dialog failures deny the request so development plugins remain disabled.
 *
 * @param mainWindow - Window that owns the native confirmation dialog.
 * @returns Whether the user explicitly chose to enable Plugin Development Mode.
 */
export function confirmEnableDevelopmentPlugins(mainWindow: BrowserWindow): boolean {
  try {
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: [i18n.t('Enable'), i18n.t('Cancel')],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
      title: i18n.t('Plugin Development Mode'),
      message: i18n.t('Enable Plugin Development Mode?'),
      detail: i18n.t(
        'Development plugins run local code and may request command access. Only enable this mode if you trust every plugin in the development plugins directory.'
      ),
    });
    return response === 0;
  } catch (error) {
    console.error('Failed to confirm Plugin Development Mode:', error);
    return false;
  }
}

/**
 * Registers the IPC handlers that read and update Plugin Development Mode.
 *
 * Requests are accepted only from the active window's main frame. Re-registering for a replacement
 * window removes the previous listeners, and changing the setting revokes command capabilities
 * before reloading the renderer.
 *
 * @param mainWindow - Active application window authorized to use the handlers.
 * @param ipcMain - Electron IPC dispatcher on which to replace the handlers.
 */
export function setupDevelopmentPluginsHandlers(mainWindow: BrowserWindow, ipcMain: IpcMain): void {
  const previousListeners = developmentPluginsIpcListeners.get(ipcMain);
  if (previousListeners) {
    ipcMain.off('request-development-plugins', previousListeners.requestDevelopmentPlugins);
    ipcMain.off('set-development-plugins', previousListeners.setDevelopmentPlugins);
    ipcMain.removeHandler('get-development-plugins');
  }

  const requestDevelopmentPlugins = (event: IpcMainEvent) => {
    if (
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    ) {
      return;
    }
    event.sender.send('development-plugins', areDevelopmentPluginsEnabled());
  };

  const setDevelopmentPlugins = (event: IpcMainEvent, enabled: boolean) => {
    if (
      typeof enabled !== 'boolean' ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    ) {
      return;
    }
    const currentlyEnabled = areDevelopmentPluginsEnabled();
    if (enabled === currentlyEnabled) {
      return;
    }
    if (enabled && !confirmEnableDevelopmentPlugins(mainWindow)) {
      event.sender.send('development-plugins', currentlyEnabled);
      return;
    }
    try {
      setDevelopmentPluginsEnabled(enabled);
    } catch (error) {
      console.error('Failed to persist Plugin Development Mode:', error);
      event.sender.send('development-plugins', currentlyEnabled);
      return;
    }
    revokeRunCmdCapabilities(ipcMain);
    mainWindow.webContents.reload();
  };
  const getDevelopmentPlugins = (event: IpcMainInvokeEvent) => {
    if (
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame
    ) {
      return false;
    }
    return areDevelopmentPluginsEnabled();
  };

  ipcMain.on('request-development-plugins', requestDevelopmentPlugins);
  ipcMain.on('set-development-plugins', setDevelopmentPlugins);
  ipcMain.handle('get-development-plugins', getDevelopmentPlugins);
  developmentPluginsIpcListeners.set(ipcMain, {
    requestDevelopmentPlugins,
    setDevelopmentPlugins,
    getDevelopmentPlugins,
  });
}
