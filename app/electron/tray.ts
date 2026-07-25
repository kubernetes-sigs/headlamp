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

import { BrowserWindow, Menu, nativeImage, Tray } from 'electron';
import { MenuItemConstructorOptions } from 'electron/main';
import path from 'path';
import { loadSettings, saveSettings, SETTINGS_PATH } from './settings';

const TRAY_SETTING_KEY = 'enableSystemTray';

type ClusterStatus = {
  name: string;
  status: 'ok' | 'error' | 'unknown';
  error?: string;
};

interface HeadlampTrayOptions {
  backendToken: string;
  createWindow: () => Promise<void>;
  getBackendPort: () => number;
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
  quit: () => void;
}

let tray: Tray | null = null;
let trayUpdateInterval: NodeJS.Timeout | null = null;
let trayUpdateTimeout: NodeJS.Timeout | null = null;

export function shouldRunTray(): boolean {
  return ['darwin', 'linux', 'win32'].includes(process.platform);
}

// settings.json is user-editable, so it may contain valid JSON that is not a
// plain object (e.g. an array or string). Treat anything else as empty.
function asSettingsObject(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

/**
 * Whether the user has the system tray icon enabled.
 * Defaults to true when the setting is unset, to preserve existing behavior.
 */
export function isTrayIconEnabled(settingsPath: string = SETTINGS_PATH): boolean {
  const settings = asSettingsObject(loadSettings(settingsPath));
  return settings[TRAY_SETTING_KEY] !== false;
}

/**
 * Persists whether the system tray icon should be created.
 * Errors writing the settings file are logged and swallowed so a failure here
 * (e.g. unwritable settings.json) can't take down the Electron main process.
 * The runtime tray state still updates; the on-disk setting just doesn't get
 * the new value, so it falls back to the previously persisted one on restart.
 */
export function setTrayIconEnabled(enabled: boolean, settingsPath: string = SETTINGS_PATH): void {
  try {
    const settings = asSettingsObject(loadSettings(settingsPath));
    settings[TRAY_SETTING_KEY] = enabled;
    saveSettings(settingsPath, settings);
  } catch (error) {
    console.error('Failed to persist tray icon setting:', error);
  }
}

export function isHeadlampTrayCreated(): boolean {
  return !!tray && !tray.isDestroyed();
}

export function cleanupHeadlampTray(): void {
  if (trayUpdateTimeout) {
    clearTimeout(trayUpdateTimeout);
    trayUpdateTimeout = null;
  }

  if (trayUpdateInterval) {
    clearInterval(trayUpdateInterval);
    trayUpdateInterval = null;
  }

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

export function createHeadlampTray(options: HeadlampTrayOptions): boolean {
  if (!shouldRunTray()) {
    return false;
  }

  if (!isTrayIconEnabled()) {
    return false;
  }

  if (isHeadlampTrayCreated()) {
    return true;
  }

  const iconPath = options.isDev
    ? path.join(__dirname, '..', 'assets', 'tray-icon.png')
    : path.join(process.resourcesPath, 'assets', 'tray-icon.png');

  const trayIcon = nativeImage.createFromPath(iconPath);
  if (trayIcon.isEmpty()) {
    console.error(
      `Failed to load tray icon from path "${iconPath}". System tray will not be created.`
    );
    return false;
  }

  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
  }

  try {
    tray = new Tray(trayIcon);
  } catch (error) {
    console.error('Failed to create system tray icon:', error);
    tray = null;
    return false;
  }

  tray.setToolTip('Headlamp');
  tray.setContextMenu(buildTrayMenu(options, [{ label: 'Loading...', enabled: false }]));

  trayUpdateTimeout = setTimeout(() => {
    updateTrayMenu(options);
    trayUpdateInterval = setInterval(() => updateTrayMenu(options), 30000);
  }, 5000);

  return true;
}

async function getClusterStatuses(options: HeadlampTrayOptions): Promise<ClusterStatus[]> {
  try {
    const configResponse = await fetch(`http://localhost:${options.getBackendPort()}/config`, {
      headers: { Authorization: `Bearer ${options.backendToken}` },
    });

    if (!configResponse.ok) {
      console.error(
        `Error while fetching cluster configurations: ${configResponse.status} ${configResponse.statusText}`
      );
      return [];
    }

    const config = await configResponse.json();

    if (!config.clusters || !Array.isArray(config.clusters)) {
      return [];
    }

    const healthChecks = config.clusters.map(async (cluster: { name: string; error?: string }) => {
      if (cluster.error) {
        return { name: cluster.name, status: 'error' as const, error: cluster.error };
      }

      try {
        const healthResponse = await fetch(
          `http://localhost:${options.getBackendPort()}/clusters/${cluster.name}/healthz`,
          {
            headers: { Authorization: `Bearer ${options.backendToken}` },
          }
        );

        if (healthResponse.ok) {
          return { name: cluster.name, status: 'ok' as const };
        }

        return { name: cluster.name, status: 'error' as const, error: 'Unreachable' };
      } catch (error) {
        console.error(`Error while checking health for cluster "${cluster.name}":`, error);
        return { name: cluster.name, status: 'unknown' as const };
      }
    });

    return Promise.all(healthChecks);
  } catch (error) {
    console.error('Error while fetching cluster configurations or statuses:', error);
    return [];
  }
}

async function updateTrayMenu(options: HeadlampTrayOptions): Promise<void> {
  if (!isHeadlampTrayCreated()) {
    return;
  }

  let clusterMenuItems: MenuItemConstructorOptions[] = [
    { label: 'No clusters found', enabled: false },
  ];

  const clusterStatuses = await getClusterStatuses(options);
  if (clusterStatuses.length > 0) {
    clusterMenuItems = clusterStatuses.map(cluster => ({
      label: `${getClusterStatusIcon(cluster.status)} ${cluster.name}`,
      click: () => {
        void navigateToCluster(options, cluster.name);
      },
    }));
  }

  tray?.setContextMenu(buildTrayMenu(options, clusterMenuItems));
}

function buildTrayMenu(
  options: HeadlampTrayOptions,
  clusterMenuItems: MenuItemConstructorOptions[]
): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Open Headlamp',
      click: () => {
        void showWindow(options);
      },
    },
    { type: 'separator' },
    {
      label: 'Cluster Status',
      submenu: clusterMenuItems,
    },
    {
      label: 'Settings',
      click: () => {
        void navigateToSettings(options);
      },
    },
    { type: 'separator' },
    {
      label: 'About Headlamp',
      click: () => openAboutDialog(options),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: options.quit,
    },
  ]);
}

async function showWindow(options: HeadlampTrayOptions): Promise<BrowserWindow | null> {
  let mainWindow = options.getMainWindow();
  if (!mainWindow) {
    await options.createWindow();
    mainWindow = options.getMainWindow();
  }

  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }

  return mainWindow;
}

async function navigateToCluster(options: HeadlampTrayOptions, clusterName: string): Promise<void> {
  const mainWindow = await showWindow(options);
  if (!mainWindow) {
    return;
  }

  executeWhenReady(mainWindow, `window.location.hash = '#/c/${encodeURIComponent(clusterName)}';`);
}

async function navigateToSettings(options: HeadlampTrayOptions): Promise<void> {
  const mainWindow = await showWindow(options);
  if (!mainWindow) {
    return;
  }

  executeWhenReady(mainWindow, "window.location.hash = '#/settings/general';");
}

function openAboutDialog(options: HeadlampTrayOptions): void {
  const mainWindow = options.getMainWindow();
  if (!mainWindow) {
    console.warn('Cannot open About dialog because no Headlamp window is available.');
    return;
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('open-about-dialog');
}

function executeWhenReady(mainWindow: BrowserWindow, script: string): void {
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      void mainWindow.webContents.executeJavaScript(script);
    });
    return;
  }

  void mainWindow.webContents.executeJavaScript(script);
}

function getClusterStatusIcon(status: ClusterStatus['status']): string {
  switch (status) {
    case 'ok':
      return '✅';
    case 'error':
      return '❌';
    default:
      return '?';
  }
}
