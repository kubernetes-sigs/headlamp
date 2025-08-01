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

import { ChildProcessWithoutNullStreams, exec, execSync, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  MenuItem,
  MessageBoxOptions,
  screen,
  shell,
} from 'electron';
import { IpcMainEvent, MenuItemConstructorOptions } from 'electron/main';
import find_process from 'find-process';
import * as fsPromises from 'fs/promises';
import fs from 'node:fs';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';
import { platform } from 'os';
import path from 'path';
import url from 'url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import i18n from './i18next.config';
import {
  addToPath,
  ArtifactHubHeadlampPkg,
  defaultPluginsDir,
  getMatchingExtraFiles,
  getPluginBinDirectories,
  PluginManager,
} from './plugin-management';
import { addRunCmdConsent, removeRunCmdConsent, runScript, setupRunCmdHandlers } from './runCmd';
import windowSize from './windowSize';

if (process.env.HEADLAMP_RUN_SCRIPT) {
  runScript();
}

dotenv.config({ path: path.join(process.resourcesPath, '.env') });

const isDev = process.env.ELECTRON_DEV || false;
let frontendPath = '';

if (isDev) {
  frontendPath = path.resolve('..', 'frontend', 'build', 'index.html');
} else {
  frontendPath = path.join(process.resourcesPath, 'frontend', 'index.html');
}
const backendToken = randomBytes(32).toString('hex');

const startUrl = (
  process.env.ELECTRON_START_URL ||
  url.format({
    pathname: frontendPath,
    protocol: 'file:',
    slashes: true,
  })
)
  // Windows paths use backslashes and for consistency we want to use forward slashes.
  // For example: when application triggers refresh it requests a URL with forward slashes and
  // we use startUrl to determine if it's an internal or external URL. So it's easier to
  // convert everything to forward slashes.
  .replace(/\\/g, '/');

const args = yargs(hideBin(process.argv))
  .command(
    'list-plugins',
    'List all static and user-added plugins.',
    () => {},
    () => {
      try {
        const backendPath = path.join(process.resourcesPath, 'headlamp-server');
        const stdout = execSync(`${backendPath} list-plugins`);
        process.stdout.write(stdout);
        process.exit(0);
      } catch (error) {
        console.error(`Error listing plugins: ${error}`);
        process.exit(1);
      }
    }
  )
  .options({
    headless: {
      describe: 'Open Headlamp in the default web browser instead of its app window',
      type: 'boolean',
    },
    'disable-gpu': {
      describe: 'Disable use of GPU. For people who may have buggy graphics drivers',
      type: 'boolean',
    },
    'watch-plugins-changes': {
      describe: 'Reloads plugins when there are changes to them or their directory',
      type: 'boolean',
    },
  })
  .positional('kubeconfig', {
    describe:
      'Path to the kube config file (uses the default kube config location if not specified)',
    type: 'string',
  })
  .help()
  .parseSync();

const isHeadlessMode = args.headless === true;
let disableGPU = args['disable-gpu'] === true;
const defaultPort = 4466;

const useExternalServer = process.env.EXTERNAL_SERVER || false;
const shouldCheckForUpdates = process.env.HEADLAMP_CHECK_FOR_UPDATES !== 'false';
const manifestDir = isDev ? path.resolve('./') : process.resourcesPath;
const manifestFile = path.join(manifestDir, 'app-build-manifest.json');
const buildManifest = fs.existsSync(manifestFile) ? require(manifestFile) : {};

// make it global so that it doesn't get garbage collected
let mainWindow: BrowserWindow | null;

/**
 * `Action` is an interface for an action to be performed by the plugin manager.
 *
 * @interface
 * @property {string} identifier - The unique identifier for the action.
 * @property {'INSTALL' | 'UNINSTALL' | 'UPDATE' | 'LIST' | 'CANCEL' | 'GET'} action - The type of the action.
 * @property {string} [URL] - The URL for the action. Optional.
 * @property {string} [destinationFolder] - The destination folder for the action. Optional.
 * @property {string} [headlampVersion] - The version of Headlamp for the action. Optional.
 * @property {string} [pluginName] - The name of the plugin for the action. Optional.
 */
interface Action {
  identifier: string;
  action: 'INSTALL' | 'UNINSTALL' | 'UPDATE' | 'LIST' | 'CANCEL' | 'GET';
  URL?: string;
  destinationFolder?: string;
  headlampVersion?: string;
  pluginName?: string;
}

/**
 * `ProgressResp` is an interface for progress response.
 *
 * @interface
 * @property {string} type - The type of the progress response.
 * @property {string} message - The message of the progress response.
 * @property {Record<string, any>} data - Additional data for the progress response. Optional.
 */
interface ProgressResp {
  type: string;
  message: string;
  data?: Record<string, any>;
}

/**
 * `PluginManagerEventListeners` is a class that manages event listeners for plugins-manager.
 *
 * @class
 */
class PluginManagerEventListeners {
  private cache: {
    [key: string]: {
      action: 'INSTALL' | 'UNINSTALL' | 'UPDATE' | 'LIST' | 'CANCEL';
      progress: ProgressResp;
      controller?: AbortController;
      percentage?: number;
    };
  } = {};

  constructor() {
    this.cache = {};
  }

  /**
   * Converts the progress response to a percentage.
   *
   * @param {ProgressResp} progress - The progress response object.
   * @returns {number} The progress as a percentage.
   */
  private convertProgressToPercentage(progress: ProgressResp): number {
    switch (progress.message) {
      case 'Fetching Plugin Metadata':
        return 20;
      case 'Plugin Metadata Fetched':
        return 30;
      case 'Downloading Plugin':
        return 50;
      case 'Plugin Downloaded':
        return 100;
      default:
        return 0;
    }
  }

  /**
   * Sets up event handlers for plugin-manager.
   *
   * @method
   * @name setupEventHandlers
   */
  setupEventHandlers() {
    ipcMain.on('plugin-manager', async (event, data) => {
      const eventData = JSON.parse(data) as Action;
      const { identifier, action } = eventData;
      const updateCache = (progress: ProgressResp) => {
        const percentage = this.convertProgressToPercentage(progress);
        this.cache[identifier].progress = progress;
        this.cache[identifier].percentage = percentage;
      };

      switch (action) {
        case 'INSTALL':
          this.handleInstall(eventData, updateCache);
          break;
        case 'UPDATE':
          this.handleUpdate(eventData, updateCache);
          break;
        case 'UNINSTALL':
          this.handleUninstall(eventData, updateCache);
          break;
        case 'LIST':
          this.handleList(event, eventData);
          break;
        case 'CANCEL':
          this.handleCancel(event, identifier);
          break;
        case 'GET':
          this.handleGet(event, identifier);
          break;
        default:
          console.error(`Unknown action: ${action}`);
      }
    });
  }

  /**
   * Handles the installation process.
   *
   * @method
   * @name handleInstall
   * @private
   */
  private async handleInstall(eventData: Action, updateCache: (progress: ProgressResp) => void) {
    const { identifier, URL, destinationFolder, headlampVersion, pluginName } = eventData;

    if (!mainWindow) {
      return { type: 'error', message: 'Main window is not available' };
    }

    if (!URL) {
      return { type: 'error', message: 'URL is required' };
    }

    const controller = new AbortController();

    this.cache[identifier] = {
      action: 'INSTALL',
      progress: { type: 'info', message: 'waiting for user consent' },
      percentage: 0,
      controller,
    };

    let pluginInfo: ArtifactHubHeadlampPkg | undefined = undefined;
    try {
      pluginInfo = await PluginManager.fetchPluginInfo(URL, { signal: controller.signal });
    } catch (error) {
      console.error('Error fetching plugin info:', error);
      dialog.showErrorBox(
        i18n.t('Failed to fetch plugin info'),
        i18n.t('An error occurred while fetching plugin info from {{  URL }}.', { URL })
      );
      return { type: 'error', message: 'Failed to fetch plugin info' };
    }

    const { matchingExtraFiles } = getMatchingExtraFiles(
      pluginInfo?.extraFiles ? pluginInfo?.extraFiles : {}
    );
    const extraUrls = matchingExtraFiles.map(file => file.url);
    const allUrls = [pluginInfo.archiveURL, ...extraUrls].join(', ');

    const dialogOptions: MessageBoxOptions = {
      type: 'question',
      buttons: [i18n.t('Yes'), i18n.t('No')],
      defaultId: 1,
      title: i18n.t('Plugin Installation'),
      message: i18n.t('Do you want to install the plugin "{{ pluginName }}"?', { pluginName }),
      detail: i18n.t('You are about to install a plugin from: {{ url }}\nDo you want to proceed?', {
        url: allUrls,
      }),
    };

    let userChoice: number;
    try {
      const answer = await dialog.showMessageBox(mainWindow, dialogOptions);
      userChoice = answer.response;
    } catch (error) {
      console.error('Error during installation process:', error);
      return { type: 'error', message: 'An error occurred during the installation process' };
    }

    console.log('User response:', userChoice);
    if (userChoice === 1) {
      // User clicked "No"
      this.cache[identifier] = {
        action: 'INSTALL',
        progress: { type: 'error', message: 'installation cancelled due to user consent' },
        percentage: 0,
        controller,
      };
      return { type: 'error', message: 'Installation cancelled due to user consent' };
    }

    // User clicked "Yes", proceed with installation
    this.cache[identifier] = {
      action: 'INSTALL',
      progress: { type: 'info', message: 'installing plugin' },
      percentage: 10,
      controller,
    };

    addRunCmdConsent(pluginInfo);

    PluginManager.installFromPluginPkg(
      pluginInfo,
      destinationFolder,
      headlampVersion,
      progress => {
        updateCache(progress);
      },
      controller.signal
    );

    return { type: 'info', message: 'Installation started' };
  }
  /**
   * Handles the update process.
   *
   * @method
   * @name handleUpdate
   * @private
   */
  private handleUpdate(eventData: Action, updateCache: (progress: ProgressResp) => void) {
    const { identifier, pluginName, destinationFolder, headlampVersion } = eventData;
    if (!pluginName) {
      this.cache[identifier] = {
        action: 'UPDATE',
        progress: { type: 'error', message: 'Plugin Name is required' },
      };
      return;
    }

    const controller = new AbortController();
    this.cache[identifier] = {
      action: 'UPDATE',
      percentage: 10,
      progress: { type: 'info', message: 'updating plugin' },
      controller,
    };

    PluginManager.update(
      pluginName,
      destinationFolder,
      headlampVersion,
      progress => {
        updateCache(progress);
      },
      controller.signal
    );
  }

  /**
   * Handles the uninstallation process.
   *
   * @method
   * @name handleUninstall
   * @private
   */
  private handleUninstall(eventData: Action, updateCache: (progress: ProgressResp) => void) {
    const { identifier, pluginName, destinationFolder } = eventData;
    if (!pluginName) {
      this.cache[identifier] = {
        action: 'UNINSTALL',
        progress: { type: 'error', message: 'Plugin Name is required' },
      };
      return;
    }

    this.cache[identifier] = {
      action: 'UNINSTALL',
      progress: { type: 'info', message: 'uninstalling plugin' },
    };

    removeRunCmdConsent(pluginName);

    PluginManager.uninstall(pluginName, destinationFolder, progress => {
      updateCache(progress);
    });
  }

  /**
   * Handles the list event.
   *
   * @method
   * @name handleList
   * @param {Electron.IpcMainEvent} event - The IPC Main Event.
   * @param {Action} eventData - The event data.
   * @private
   */
  private handleList(event: Electron.IpcMainEvent, eventData: Action) {
    const { identifier, destinationFolder } = eventData;
    PluginManager.list(destinationFolder, progress => {
      event.sender.send('plugin-manager', JSON.stringify({ identifier: identifier, ...progress }));
    });
  }

  /**
   * Handles the cancel event.
   *
   * @method
   * @name handleCancel
   * @param {Electron.IpcMainEvent} event - The IPC Main Event.
   * @param {string} identifier - The identifier of the event to cancel.
   * @private
   */
  private handleCancel(event: Electron.IpcMainEvent, identifier: string) {
    const cacheEntry = this.cache[identifier];
    if (cacheEntry?.controller) {
      cacheEntry.controller.abort();
      event.sender.send(
        'plugin-manager',
        JSON.stringify({ type: 'success', message: 'cancelled' })
      );
    }
  }

  /**
   * Handles the get event.
   *
   * @method
   * @name handleGet
   * @param {Electron.IpcMainEvent} event - The IPC Main Event.
   * @param {string} identifier - The identifier of the event to get.
   * @private
   */
  private handleGet(event: Electron.IpcMainEvent, identifier: string) {
    const cacheEntry = this.cache[identifier];
    if (cacheEntry) {
      event.sender.send(
        'plugin-manager',
        JSON.stringify({
          identifier: identifier,
          ...cacheEntry.progress,
          percentage: cacheEntry.percentage,
        })
      );
    } else {
      event.sender.send(
        'plugin-manager',
        JSON.stringify({
          type: 'error',
          message: 'No such operation in progress',
        })
      );
    }
  }
}

/**
 * Returns the user's preferred shell or a fallback shell.
 * @returns A promise that resolves to the shell path.
 */
async function getShell(): Promise<string> {
  // Fallback chain
  const shells = ['/bin/zsh', '/bin/bash', '/bin/sh'];
  let userShell = '';

  try {
    userShell = userInfo().shell || process.env.SHELL || '';
    if (userShell) shells.unshift(userShell);
  } catch (error) {
    console.error('Failed to get user shell:', error);
  }

  for (const shell of shells) {
    try {
      await fsPromises.stat(shell);
      return shell;
    } catch (error) {
      console.error(`Shell not found: ${shell}, error: ${error}`);
    }
  }

  console.error('No valid shell found, defaulting to /bin/sh');
  return '/bin/sh';
}

/**
 * Retrieves the environment variables from the user's shell.
 * @returns A promise that resolves to the shell environment.
 */
async function getShellEnv(): Promise<NodeJS.ProcessEnv> {
  const execPromisify = promisify(exec);
  const shell = await getShell();
  const isWindows = process.platform === 'win32';

  // For Windows, just return the current environment
  if (isWindows) {
    return { ...process.env };
  }

  // For Unix-like systems
  const isZsh = shell.includes('zsh');
  // interactive is supported only on zsh
  const shellArgs = isZsh ? ['--login', '--interactive', '-c'] : ['--login', '-c'];

  try {
    const env = { ...process.env, DISABLE_AUTO_UPDATE: 'true' };
    let stdout: string;
    let isEnvNull = false;

    try {
      // Try env -0 first
      const command = 'env -0';
      ({ stdout } = await execPromisify(`${shell} ${shellArgs.join(' ')} '${command}'`, {
        encoding: 'utf8',
        timeout: 10000,
        env,
      }));
      isEnvNull = true;
    } catch (error) {
      // If env -0 fails, fall back to env
      console.log('env -0 failed, falling back to env');
      const command = 'env';
      ({ stdout } = await execPromisify(`${shell} ${shellArgs.join(' ')} '${command}'`, {
        encoding: 'utf8',
        timeout: 10000,
        env,
      }));
    }

    const processLines = (separator: string) => {
      return stdout.split(separator).reduce((acc, line) => {
        const firstEqualIndex = line.indexOf('=');
        if (firstEqualIndex > 0) {
          const key = line.slice(0, firstEqualIndex);
          const value = line.slice(firstEqualIndex + 1);
          acc[key] = value;
        }
        return acc;
      }, {} as NodeJS.ProcessEnv);
    };

    const envVars = isEnvNull ? processLines('\0') : processLines('\n');
    const mergedEnv = { ...process.env, ...envVars };
    return mergedEnv;
  } catch (error) {
    console.error('Failed to get shell environment:', error);
    return process.env;
  }
}

async function startServer(flags: string[] = []): Promise<ChildProcessWithoutNullStreams> {
  const serverFilePath = isDev
    ? path.resolve('../backend/headlamp-server')
    : path.join(process.resourcesPath, './headlamp-server');

  let serverArgs: string[] = ['--listen-addr=localhost'];
  if (!!args.kubeconfig) {
    serverArgs = serverArgs.concat(['--kubeconfig', args.kubeconfig]);
  }
  const proxyUrls = !!buildManifest && buildManifest['proxy-urls'];
  if (!!proxyUrls && proxyUrls.length > 0) {
    serverArgs = serverArgs.concat(['--proxy-urls', proxyUrls.join(',')]);
  }
  if (args.watchPluginsChanges !== undefined) {
    serverArgs.push(`--watch-plugins-changes=${args.watchPluginsChanges}`);
  }

  const bundledPlugins = path.join(process.resourcesPath, '.plugins');

  // Enable the Helm and dynamic cluster endpoints
  process.env.HEADLAMP_CONFIG_ENABLE_HELM = 'true';
  process.env.HEADLAMP_CONFIG_ENABLE_DYNAMIC_CLUSTERS = 'true';

  // Pass a token to the backend that can be used for auth on some routes
  process.env.HEADLAMP_BACKEND_TOKEN = backendToken;

  // Set the bundled plugins in addition to the the user's plugins.
  if (fs.existsSync(bundledPlugins) && fs.readdirSync(bundledPlugins).length !== 0) {
    process.env.HEADLAMP_STATIC_PLUGINS_DIR = bundledPlugins;
  }

  serverArgs = serverArgs.concat(flags);
  console.log('arguments passed to backend server', serverArgs);

  let extendedEnv;
  try {
    extendedEnv = await getShellEnv();
  } catch (error) {
    console.error('Failed to get shell environment, using default:', error);
    extendedEnv = process.env;
  }

  const options = {
    detached: true,
    windowsHide: true,
    env: {
      ...extendedEnv,
    },
  };

  return spawn(serverFilePath, serverArgs, options);
}

/**
 * Are we running inside WSL?
 * @returns true if we are running inside WSL.
 */
function isWSL(): boolean {
  try {
    const data = fs.readFileSync('/proc/version', {
      encoding: 'utf8',
      flag: 'r',
    });
    return data.indexOf('icrosoft') !== -1;
  } catch {
    return false;
  }
}

let serverProcess: ChildProcessWithoutNullStreams | null;
let intentionalQuit: boolean;
let serverProcessQuit: boolean;

function quitServerProcess() {
  if ((!serverProcess || serverProcessQuit) && process.platform !== 'win32') {
    console.error('server process already not running');
    return;
  }

  intentionalQuit = true;
  console.info('stopping server process...');

  if (!serverProcess) {
    return;
  }

  serverProcess.stdin.destroy();
  // @todo: should we try and end the process a bit more gracefully?
  //       What happens if the kill signal doesn't kill it?
  serverProcess.kill();

  serverProcess = null;
}

function getAcceleratorForPlatform(navigation: 'left' | 'right') {
  switch (platform()) {
    case 'darwin':
      return navigation === 'right' ? 'Cmd+]' : 'Cmd+[';
    case 'win32':
      return navigation === 'right' ? 'Alt+Right' : 'Alt+Left';
    default:
      return navigation === 'right' ? 'Alt+Right' : 'Alt+Left';
  }
}

function getDefaultAppMenu(): AppMenu[] {
  const isMac = process.platform === 'darwin';

  const sep = { type: 'separator' };
  const aboutMenu = {
    label: i18n.t('About'),
    role: 'about',
    id: 'original-about',
    afterPlugins: true,
  };
  const quitMenu = {
    label: i18n.t('Quit'),
    role: 'quit',
    id: 'original-quit',
  };
  const selectAllMenu = {
    label: i18n.t('Select All'),
    role: 'selectAll',
    id: 'original-select-all',
  };
  const deleteMenu = {
    label: i18n.t('Delete'),
    role: 'delete',
    id: 'original-delete',
  };

  const appMenu = [
    // { role: 'appMenu' }
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              aboutMenu,
              sep,
              {
                label: i18n.t('Services'),
                role: 'services',
                id: 'original-services',
              },
              sep,
              {
                label: i18n.t('Hide'),
                role: 'hide',
                id: 'original-hide',
              },
              {
                label: i18n.t('Hide Others'),
                role: 'hideothers',
                id: 'original-hide-others',
              },
              {
                label: i18n.t('Show All'),
                role: 'unhide',
                id: 'original-show-all',
              },
              sep,
              quitMenu,
            ],
          },
        ]
      : []),
    // { role: 'fileMenu' }
    {
      label: i18n.t('File'),
      id: 'original-file',
      submenu: [
        isMac
          ? {
              label: i18n.t('Close'),
              role: 'close',
              id: 'original-close',
            }
          : quitMenu,
      ],
    },
    // { role: 'editMenu' }
    {
      label: i18n.t('Edit'),
      id: 'original-edit',
      submenu: [
        {
          label: i18n.t('Cut'),
          role: 'cut',
          id: 'original-cut',
        },
        {
          label: i18n.t('Copy'),
          role: 'copy',
          id: 'original-copy',
        },
        {
          label: i18n.t('Paste'),
          role: 'paste',
          id: 'original-paste',
        },
        ...(isMac
          ? [
              {
                label: i18n.t('Paste and Match Style'),
                role: 'pasteAndMatchStyle',
                id: 'original-paste-and-match-style',
              },
              deleteMenu,
              selectAllMenu,
              sep,
              {
                label: i18n.t('Speech'),
                id: 'original-speech',
                submenu: [
                  {
                    label: i18n.t('Start Speaking'),
                    role: 'startspeaking',
                    id: 'original-start-speaking',
                  },
                  {
                    label: i18n.t('Stop Speaking'),
                    role: 'stopspeaking',
                    id: 'original-stop-speaking',
                  },
                ],
              },
            ]
          : [deleteMenu, sep, selectAllMenu]),
      ],
    },
    // { role: 'viewMenu' }
    {
      label: i18n.t('View'),
      id: 'original-view',
      submenu: [
        {
          label: i18n.t('Toggle Developer Tools'),
          role: 'toggledevtools',
          id: 'original-toggle-dev-tools',
        },
        sep,
        {
          label: i18n.t('Reset Zoom'),
          id: 'original-reset-zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => setZoom(1.0),
        },
        {
          label: i18n.t('Zoom In'),
          id: 'original-zoom-in',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => adjustZoom(0.1),
        },
        {
          label: i18n.t('Zoom Out'),
          id: 'original-zoom-out',
          accelerator: 'CmdOrCtrl+-',
          click: () => adjustZoom(-0.1),
        },
        sep,
        {
          label: i18n.t('Toggle Fullscreen'),
          role: 'togglefullscreen',
          id: 'original-toggle-fullscreen',
        },
      ],
    },
    {
      label: i18n.t('Navigate'),
      id: 'original-navigate',
      submenu: [
        {
          label: i18n.t('Reload'),
          role: 'forcereload',
          id: 'original-force-reload',
        },
        sep,
        {
          label: i18n.t('Go to Home'),
          role: 'homescreen',
          id: 'original-home-screen',
          click: () => {
            mainWindow?.loadURL(startUrl);
          },
        },
        {
          label: i18n.t('Go Back'),
          role: 'back',
          id: 'original-back',
          accelerator: getAcceleratorForPlatform('left'),
          enabled: false,
          click: () => {
            mainWindow?.webContents.goBack();
          },
        },
        {
          label: i18n.t('Go Forward'),
          role: 'forward',
          id: 'original-forward',
          accelerator: getAcceleratorForPlatform('right'),
          enabled: false,
          click: () => {
            mainWindow?.webContents.goForward();
          },
        },
      ],
    },
    {
      label: i18n.t('Window'),
      id: 'original-window',
      submenu: [
        {
          label: i18n.t('Minimize'),
          role: 'minimize',
          id: 'original-minimize',
        },
        ...(isMac
          ? [
              sep,
              {
                label: i18n.t('Bring All to Front'),
                role: 'front',
                id: 'original-front',
              },
              sep,
              {
                label: i18n.t('Window'),
                role: 'window',
                id: 'original-window',
              },
            ]
          : [
              {
                label: i18n.t('Close'),
                role: 'close',
                id: 'original-close',
              },
            ]),
      ],
    },
    {
      label: i18n.t('Help'),
      role: 'help',
      id: 'original-help',
      afterPlugins: true,
      submenu: [
        {
          label: i18n.t('Documentation'),
          id: 'original-documentation',
          url: 'https://headlamp.dev/docs/latest/',
        },
        {
          label: i18n.t('Open an Issue'),
          id: 'original-open-issue',
          url: 'https://github.com/kubernetes-sigs/headlamp/issues',
        },
        {
          label: i18n.t('About'),
          id: 'original-about',
          url: 'https://github.com/kubernetes-sigs/headlamp',
        },
      ],
    },
  ] as AppMenu[];

  return appMenu;
}

let loadFullMenu = false;
let currentMenu: AppMenu[] = [];

function setMenu(appWindow: BrowserWindow | null, newAppMenu: AppMenu[] = []) {
  let appMenu = newAppMenu;
  if (appMenu?.length === 0) {
    appMenu = getDefaultAppMenu();
  }

  let menu: Electron.Menu;
  try {
    const menuTemplate: (MenuItemConstructorOptions | MenuItem)[] =
      menusToTemplate(appWindow, appMenu) || [];
    menu = Menu.buildFromTemplate(menuTemplate);
  } catch (e) {
    console.error(`Failed to build menus from template ${appMenu}:`, e);
    return;
  }

  currentMenu = appMenu;
  Menu.setApplicationMenu(menu);
}

function updateMenuLabels(menus: AppMenu[]) {
  let menusToProcess = getDefaultAppMenu();
  const defaultMenusObj: { [key: string]: AppMenu } = {};

  // Add all default menus in top levels and in submenus to an object:
  // id -> menu.
  while (menusToProcess.length > 0) {
    const menu = menusToProcess.shift()!;
    // Do not process menus that have no ids, otherwise we cannot be
    // sure which one is which.
    if (!menu.id) {
      continue;
    }
    defaultMenusObj[menu.id] = menu;
    if (menu.submenu) {
      menusToProcess = [...menusToProcess, ...menu.submenu];
    }
  }

  // Add all current menus in top levels and in submenus to a list.
  menusToProcess = [...menus];
  const menusList: AppMenu[] = [];
  while (menusToProcess.length > 0) {
    const menu = menusToProcess.shift()!;
    menusList.push(menu);

    if (menu.submenu) {
      menusToProcess = [...menusToProcess, ...menu.submenu];
    }
  }

  // Replace all labels with default labels if the default and current
  // menu ids are the same.
  menusList.forEach(menu => {
    if (!!menu.label && defaultMenusObj[menu.id]) {
      menu.label = defaultMenusObj[menu.id].label;
    }
  });
}

export interface AppMenu extends Omit<Partial<MenuItemConstructorOptions>, 'click'> {
  /** A URL to open (if not starting with http, then it'll be opened in the external browser) */
  url?: string;
  /** The submenus of this menu */
  submenu?: AppMenu[];
  /** A string identifying this menu */
  id: string;
  /** Whether to render this menu only after plugins are loaded (to give it time for the plugins
   * to override the menu) */
  afterPlugins?: boolean;
}

function menusToTemplate(mainWindow: BrowserWindow | null, menusFromPlugins: AppMenu[]) {
  const menusToDisplay: MenuItemConstructorOptions[] = [];
  menusFromPlugins.forEach(appMenu => {
    const { url, afterPlugins = false, ...otherProps } = appMenu;
    const menu: MenuItemConstructorOptions = otherProps;

    if (!loadFullMenu && !!afterPlugins) {
      return;
    }

    if (!!url) {
      menu.click = async () => {
        // Open external links in the external browser.
        if (!!mainWindow && !url.startsWith('http')) {
          mainWindow.webContents.loadURL(url);
        } else {
          await shell.openExternal(url);
        }
      };
    }

    // If the menu has a submenu, then recursively convert it.
    if (Array.isArray(otherProps.submenu)) {
      menu.submenu = menusToTemplate(mainWindow, otherProps.submenu);
    }

    menusToDisplay.push(menu);
  });

  return menusToDisplay;
}

async function getRunningHeadlampPIDs() {
  const processes = await find_process('name', 'headlamp-server.*');
  if (processes.length === 0) {
    return null;
  }

  return processes.map(pInfo => pInfo.pid);
}

function killProcess(pid: number) {
  if (process.platform === 'win32') {
    // Otherwise on Windows the process will stick around.
    execSync('taskkill /pid ' + pid + ' /T /F');
  } else {
    process.kill(pid, 'SIGHUP');
  }
}

const ZOOM_FILE_PATH = path.join(app.getPath('userData'), 'headlamp-config.json');
let cachedZoom: number = 1.0;

function saveZoomFactor(factor: number) {
  try {
    fs.writeFileSync(ZOOM_FILE_PATH, JSON.stringify({ zoomFactor: factor }), 'utf-8');
  } catch (err) {
    console.error('Failed to save zoom factor:', err);
  }
}

function loadZoomFactor() {
  try {
    const { zoomFactor = 1.0 } = JSON.parse(fs.readFileSync(ZOOM_FILE_PATH, 'utf-8'));
    return zoomFactor;
  } catch (err) {
    console.error('Failed to load zoom factor, defaulting to 1.0:', err);
    return 1.0;
  }
}

// The zoom factor should respect the fixed limits set by Electron.
function clampZoom(factor: number) {
  return Math.min(5.0, Math.max(0.25, factor));
}

function setZoom(factor: number) {
  cachedZoom = factor;
  mainWindow?.webContents.setZoomFactor(cachedZoom);
}

function adjustZoom(delta: number) {
  const newZoom = clampZoom(cachedZoom + delta);
  setZoom(newZoom);
}

function startElecron() {
  console.info('App starting...');

  let appVersion: string;
  if (isDev && process.env.HEADLAMP_APP_VERSION) {
    appVersion = process.env.HEADLAMP_APP_VERSION;
    console.debug(`Overridding app version to ${appVersion}`);
  } else {
    appVersion = app.getVersion();
  }

  console.log('Check for updates: ', shouldCheckForUpdates);

  async function createWindow() {
    if (!useExternalServer) {
      serverProcess = await startServer();
      attachServerEventHandlers(serverProcess);

      serverProcess.addListener('exit', async e => {
        const ERROR_ADDRESS_IN_USE = 98;
        if (e === ERROR_ADDRESS_IN_USE) {
          const runningHeadlamp = await getRunningHeadlampPIDs();
          let shouldWaitForKill = true;

          if (!mainWindow) {
            return;
          }

          if (!!runningHeadlamp) {
            const resp = dialog.showMessageBoxSync(mainWindow, {
              // Avoiding mentioning Headlamp here because it may run under a different name depending on branding (plugins).
              title: i18n.t('Another process is running'),
              message: i18n.t(
                'Looks like another process is already running. Continue by terminating that process automatically, or quit?'
              ),
              type: 'question',
              buttons: [i18n.t('Continue'), i18n.t('Quit')],
            });

            if (resp === 0) {
              runningHeadlamp.forEach(pid => {
                try {
                  killProcess(pid);
                } catch (e: unknown) {
                  const message = e instanceof Error ? e.message : String(e);
                  console.error(
                    `Failed to kill headlamp-server process with PID ${pid}: ${message}`
                  );
                  shouldWaitForKill = false;
                }
              });
            } else {
              mainWindow.close();
              return;
            }
          }

          // If we reach here, then we attempted to kill headlamp-server. Let's make sure it's killed
          // before starting our own, or else we may end up in a race condition (failing to start the
          // new one before the existing one is fully killed).
          if (!!runningHeadlamp && shouldWaitForKill) {
            let stillRunning = true;
            let timeWaited = 0;
            const maxWaitTime = 3000; // ms
            // @todo: Use an iterative back-off strategy for the wait (so we can start by waiting for shorter times).
            for (let tries = 1; timeWaited < maxWaitTime && stillRunning; tries++) {
              console.debug(
                `Checking if Headlamp is still running after we asked it to be killed; ${tries} ${timeWaited}/${maxWaitTime}ms wait.`
              );

              // Wait (10 * powers of 2) ms with a max of 250 ms
              const waitTime = Math.min(10 * tries ** 2, 250); // ms
              await new Promise(f => setTimeout(f, waitTime));

              timeWaited += waitTime;

              stillRunning = !!(await getRunningHeadlampPIDs());
              console.debug(stillRunning ? 'Still running...' : 'No longer running!');
            }
          }

          // If we couldn't kill the process, warn the user and quit.
          const processes = await getRunningHeadlampPIDs();
          if (!!processes) {
            dialog.showMessageBoxSync({
              type: 'warning',
              title: i18n.t('Failed to quit the other running process'),
              message: i18n.t(
                `Could not quit the other running process, PIDs: {{ process_list }}. Please stop that process and relaunch the app.`,
                { process_list: processes }
              ),
            });

            mainWindow.close();
            return;
          }
          serverProcess = await startServer();
          attachServerEventHandlers(serverProcess);
        }
      });
    }

    // WSL has a problem with full size window placement, so make it smaller.
    const withMargin = isWSL();
    const { width, height } = windowSize(screen.getPrimaryDisplay().workAreaSize, withMargin);

    mainWindow = new BrowserWindow({
      width,
      height,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: `${__dirname}/preload.js`,
      },
    });

    // Load the frontend
    mainWindow.loadURL(startUrl);

    setMenu(mainWindow, currentMenu);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      // allow all urls starting with app startUrl to open in electron
      if (url.startsWith(startUrl)) {
        return { action: 'allow' };
      }
      // otherwise open url in a browser and prevent default
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.webContents.on('did-start-navigation', () => {
      const navigateMenu = Menu.getApplicationMenu()?.getMenuItemById('original-navigate')?.submenu;
      const goBackMenu = navigateMenu?.getMenuItemById('original-back');
      if (!!goBackMenu) {
        goBackMenu.enabled = mainWindow?.webContents.canGoBack() || false;
      }

      const goForwardMenu = navigateMenu?.getMenuItemById('original-forward');
      if (!!goForwardMenu) {
        goForwardMenu.enabled = mainWindow?.webContents.canGoForward() || false;
      }
    });

    mainWindow.webContents.on('did-finish-load', () => {
      const startZoom = loadZoomFactor();
      setZoom(startZoom);
    });

    mainWindow.webContents.on('dom-ready', () => {
      const defaultMenu = getDefaultAppMenu();
      const currentMenu = JSON.parse(JSON.stringify(defaultMenu));
      mainWindow?.webContents.send('currentMenu', currentMenu);
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    // Force Single Instance Application
    const gotTheLock = app.requestSingleInstanceLock();
    if (gotTheLock) {
      app.on('second-instance', () => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
      });
    } else {
      app.quit();
      return;
    }

    /*
    if a library is trying to open a url other than app url in electron take it
    to the default browser
    */
    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith(startUrl)) {
        return;
      }
      event.preventDefault();
      shell.openExternal(url);
    });

    app.on('open-url', (event, url) => {
      mainWindow?.focus();
      let urlObj;
      try {
        urlObj = new URL(url);
      } catch (e) {
        dialog.showErrorBox(
          i18n.t('Invalid URL'),
          i18n.t('Application opened with an invalid URL: {{ url }}', { url })
        );
        return;
      }

      const urlParam = urlObj.hostname;
      let baseUrl = startUrl;
      // this check helps us to avoid adding multiple / to the startUrl when appending the incoming url to it
      if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, startUrl.length - 1);
      }
      // load the index.html from build and route to the hostname received in the protocol handler url
      mainWindow?.loadURL(baseUrl + '#' + urlParam + urlObj.search);
    });

    i18n.on('languageChanged', () => {
      updateMenuLabels(currentMenu);
      setMenu(mainWindow, currentMenu);
    });

    ipcMain.on('appConfig', () => {
      mainWindow?.webContents.send('appConfig', {
        checkForUpdates: shouldCheckForUpdates,
        appVersion,
      });
    });

    ipcMain.on('pluginsLoaded', () => {
      loadFullMenu = true;
      console.info('Plugins are loaded. Loading full menu.');
      setMenu(mainWindow, currentMenu);
    });

    ipcMain.on('setMenu', (event: IpcMainEvent, menus: any) => {
      if (!mainWindow) {
        return;
      }

      // We don't even process this call if we're running in headless mode.
      if (isHeadlessMode) {
        console.log('Ignoring menu change from plugins because of headless mode.');
        return;
      }

      // Ignore the menu change if we received null.
      if (!menus) {
        console.log('Ignoring menu change from plugins because null was sent.');
        return;
      }

      // We update the menu labels here in case the language changed between the time
      // the original menu was sent to the renderer and the time it was received here.
      updateMenuLabels(menus);
      setMenu(mainWindow, menus);
    });

    ipcMain.on('locale', (event: IpcMainEvent, newLocale: string) => {
      if (!!newLocale && i18n.language !== newLocale) {
        i18n.changeLanguage(newLocale);
      }
    });

    ipcMain.on('request-backend-token', () => {
      mainWindow?.webContents.send('backend-token', backendToken);
    });

    setupRunCmdHandlers(mainWindow, ipcMain);

    new PluginManagerEventListeners().setupEventHandlers();

    // Also add bundled plugin bin directories to PATH
    const bundledPlugins = path.join(process.resourcesPath, '.plugins');
    const bundledPluginBinDirs = getPluginBinDirectories(bundledPlugins);
    if (bundledPluginBinDirs.length > 0) {
      addToPath(bundledPluginBinDirs, 'bundled plugin');
    }

    // Add the installed plugins as well
    const userPluginBinDirs = getPluginBinDirectories(defaultPluginsDir());
    if (userPluginBinDirs.length > 0) {
      addToPath(userPluginBinDirs, 'userPluginBinDirs plugin');
    }
  }

  if (disableGPU) {
    console.info('Disabling GPU hardware acceleration. Reason: related flag is set.');
  } else if (
    disableGPU === undefined &&
    process.platform === 'linux' &&
    ['arm', 'arm64'].includes(process.arch)
  ) {
    console.info(
      'Disabling GPU hardware acceleration. Reason: known graphical issues in Linux on ARM (use --disable-gpu=false to force it if needed).'
    );
    disableGPU = true;
  }

  if (disableGPU) {
    app.disableHardwareAcceleration();
  }

  app.on('ready', createWindow);
  app.on('activate', function () {
    if (mainWindow === null) {
      createWindow();
    }
  });

  app.once('window-all-closed', app.quit);

  app.once('before-quit', () => {
    saveZoomFactor(cachedZoom);
    i18n.off('languageChanged');
    if (mainWindow) {
      mainWindow.removeAllListeners('close');
    }
  });
}

app.on('quit', quitServerProcess);

/**
 * add some error handlers to the serverProcess.
 * @param  {ChildProcess} serverProcess to attach the error handlers to.
 */
function attachServerEventHandlers(serverProcess: ChildProcessWithoutNullStreams) {
  serverProcess.on('error', err => {
    console.error(`server process failed to start: ${err}`);
  });
  serverProcess.stdout.on('data', data => {
    console.info(`server process stdout: ${data}`);
  });
  serverProcess.stderr.on('data', data => {
    const sterrMessage = `server process stderr: ${data}`;
    if (data && data.indexOf && data.indexOf('Requesting') !== -1) {
      // The server prints out urls it's getting, which aren't errors.
      console.info(sterrMessage);
    } else {
      console.error(sterrMessage);
    }
  });
  serverProcess.on('close', (code, signal) => {
    const closeMessage = `server process process exited with code:${code} signal:${signal}`;
    if (!intentionalQuit) {
      // @todo: message mainWindow, or loadURL to an error url?
      console.error(closeMessage);
    } else {
      console.info(closeMessage);
    }
    serverProcessQuit = true;
  });
}

if (isHeadlessMode) {
  startServer(['-html-static-dir', path.join(process.resourcesPath, './frontend')]).then(
    serverProcess => {
      attachServerEventHandlers(serverProcess);

      // Give 1s for backend to start
      setTimeout(() => shell.openExternal(`http://localhost:${defaultPort}`), 1000);
    }
  );
} else {
  startElecron();
}
