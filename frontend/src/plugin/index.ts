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

/**
 * The index.ts should have the functions that Headlamp itself needs for
 * loading the plugins.
 * The lib.ts file should carry the bits to be used by plugins whereas
 */
import * as Iconify from '@iconify/react';
import * as ReactMonacoEditor from '@monaco-editor/react';
import * as MuiLab from '@mui/lab';
import * as MuiMaterial from '@mui/material';
import * as MuiMaterialStyles from '@mui/material/styles';
import { styled } from '@mui/system';
import * as Lodash from 'lodash';
import * as MonacoEditor from 'monaco-editor';
import * as Notistack from 'notistack';
import * as React from 'react';
import * as ReactJSX from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as ReactRedux from 'react-redux';
import * as ReactRouter from 'react-router-dom';
import * as Recharts from 'recharts';
import semver from 'semver';
import { runCommand } from '../components/App/runCommand';
import { themeSlice } from '../components/App/themeSlice';
import * as CommonComponents from '../components/common';
import { addBackstageAuthHeaders } from '../helpers/addBackstageAuthHeaders';
import { getAppUrl } from '../helpers/getAppUrl';
import { isElectron } from '../helpers/isElectron';
import i18next from '../i18n/config';
import * as K8s from '../lib/k8s';
import * as ApiProxy from '../lib/k8s/apiProxy';
import * as Crd from '../lib/k8s/crd';
import * as Notification from '../lib/notification';
import * as Router from '../lib/router';
import * as Utils from '../lib/util';
import { eventAction, HeadlampEventType } from '../redux/headlampEventSlice';
import store from '../redux/stores/store';
import { Headlamp, Plugin } from './lib';
import { changePluginLanguage, initializePluginI18n } from './pluginI18n';
import { useTranslation } from './pluginI18n';
import { PluginInfo } from './pluginsSlice';
import Registry, * as registryToExport from './registry';
import { getInfoForRunningPlugins, identifyPackages, runPlugin, runPluginProps } from './runPlugin';

window.pluginLib = {
  ApiProxy,
  ReactMonacoEditor: {
    ...ReactMonacoEditor,
    // required for compatibility with plugins built with webpack
    __esModule: true,
  },
  MonacoEditor,
  K8s,
  Crd: {
    ...Crd,
    // required for compatibility with plugins built with webpack
    __esModule: true,
  },
  CommonComponents,
  MuiMaterial: {
    ...MuiMaterial,
    styles: MuiMaterialStyles,
  },
  /**
   * @mui/styles is not compatible with React.StrictMode or React 18, and it will not be updated.
   * Workaround is using styled function from @mui/system
   */
  MuiStyles: {
    makeStyles: styled,
  },
  MuiLab,
  React,
  ReactJSX,
  ReactDOM,
  Recharts,
  ReactRouter,
  ReactRedux,
  Router,
  Utils,
  Iconify,
  Lodash,
  Notistack,
  Notification,
  Headlamp,
  Plugin,
  useTranslation,
  ...registryToExport,
};

// backwards compat.
window.pluginLib.MuiCore = window.pluginLib.MuiMaterial;

// @todo: should window.plugins be private?
// @todo: Should all the plugin objects be in a single window.Headlamp object?
window.plugins = {};

/**
 * Load external, then local plugins. Then initialize() them in order with a Registry.
 */
export async function initializePlugins() {
  // Initialize every plugin in the order they were loaded.
  return new Promise(resolve => {
    for (const pluginName of Object.keys(window.plugins)) {
      const plugin = window.plugins[pluginName];
      try {
        // @todo: what should happen if this fails?
        plugin.initialize(new Registry());
      } catch (e) {
        console.error(`Plugin initialize() error in ${pluginName}:`, e);
      }
    }
    resolve(undefined);
  });
}

/**
 * This can be used to filter out which of the plugins we should execute.
 *
 * @param sources array of source to execute. Has the same order as packageInfos.
 * @param packageInfos array of package.json contents
 * @param appMode if we are in app mode
 * @param compatibleVersion headlamp-plugin version this build is compatible with.
 *     If the plugin engine version is not compatible, the plugin will not be loaded.
 *     Can be set to a semver range, e.g. '>= 0.6.0' or '0.6.0 - 0.7.0'.
 *     If set to an empty string, all plugin versions will be loaded.
 * @param settingsPackages the packages from settings
 *
 * @returns the sources to execute and incompatible PackageInfos
 *          with this structure { sourcesToExecute, incompatiblePackageInfos }
 */
export function filterSources(
  sources: string[],
  packageInfos: PluginInfo[],
  appMode: boolean,
  compatibleVersion: string,
  settingsPackages?: PluginInfo[]
) {
  const incompatiblePlugins: Record<string, PluginInfo> = {};

  // combine the parallel arrays
  const sourcesAndPackageInfos = sources.map((source, i) => {
    return { source, packageInfo: packageInfos[i] };
  });

  const enabledSourcesAndPackageInfos = sourcesAndPackageInfos.filter(({ packageInfo }) => {
    // When not in appMode we don't have settings to enable plugins.
    if (!appMode) {
      return true;
    }

    // No plugins should be enabled if settings are not set.
    if (!settingsPackages) {
      return false;
    }

    // settingsPackages might have a different order or length than packageInfos
    // If it's not in the settings don't enable the plugin.
    const enabledInSettings =
      settingsPackages[settingsPackages.findIndex(x => x.name === packageInfo.name)]?.isEnabled ===
      true;
    return enabledInSettings;
  });

  const compatible = enabledSourcesAndPackageInfos.filter(({ packageInfo }) => {
    const isCompatible = semver.satisfies(
      semver.coerce(packageInfo.devDependencies?.['@kinvolk/headlamp-plugin']) || '',
      compatibleVersion
    );
    if (!isCompatible) {
      incompatiblePlugins[packageInfo.name] = packageInfo;
      return false;
    }
    return true;
  });

  return {
    sourcesToExecute: compatible.map(({ source }) => source),
    incompatiblePlugins,
  };
}

/**
 * Apply priority-based plugin loading logic.
 *
 * When multiple versions of the same plugin exist across different locations:
 * - Priority order: development > user > shipped
 * - Only the highest priority ENABLED version is loaded
 * - If a higher priority version is disabled, the next enabled version is loaded
 * - Lower priority versions are marked with isLoaded=false and overriddenBy info
 *
 * @param plugins List of all plugins from all locations
 * @returns Plugins with isLoaded and overriddenBy fields set appropriately
 */
export function applyPluginPriority(plugins: PluginInfo[]): PluginInfo[] {
  // Group plugins by name
  const pluginsByName = new Map<string, PluginInfo[]>();

  plugins.forEach(plugin => {
    const existing = pluginsByName.get(plugin.name) || [];
    existing.push(plugin);
    pluginsByName.set(plugin.name, existing);
  });

  const result: PluginInfo[] = [];

  // Process each plugin name group
  pluginsByName.forEach(versions => {
    if (versions.length === 1) {
      // Only one version exists, mark it as loaded if enabled
      result.push({
        ...versions[0],
        isLoaded: versions[0].isEnabled !== false,
      });
      return;
    }

    // Multiple versions exist - apply priority
    const priorityOrder: Array<'development' | 'user' | 'shipped'> = [
      'development',
      'user',
      'shipped',
    ];

    // Sort versions by priority (highest first)
    const sortedVersions = versions.sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.type || 'shipped');
      const bPriority = priorityOrder.indexOf(b.type || 'shipped');
      return aPriority - bPriority;
    });

    // Find the highest priority enabled version
    let loadedVersion: PluginInfo | null = null;

    for (const version of sortedVersions) {
      if (version.isEnabled !== false) {
        loadedVersion = version;
        break;
      }
    }

    // Mark each version appropriately
    sortedVersions.forEach(version => {
      if (loadedVersion && version === loadedVersion) {
        // This is the version that will be loaded
        result.push({
          ...version,
          isLoaded: true,
        });
      } else {
        // This version is overridden by a higher priority version
        result.push({
          ...version,
          isLoaded: false,
          overriddenBy: loadedVersion?.type,
        });
      }
    });
  });

  return result;
}

/**
 * Updates settings packages based on what the backend provides.
 *
 * - For new plugins (not in settings), includes them with isEnabled=true
 * - For existing plugins (in settings), preserves their isEnabled preference
 * - Returns only plugins that exist in the backend list (automatically removing any that are gone)
 * - Treats plugins with the same name but different types as separate entries
 * - Each plugin is identified by name + type combination
 *
 * @param backendPlugins the list of plugins info from the backend.
 * @param settingsPlugins the list of plugins the settings already knows about.
 * @returns plugin info for the settings (only includes plugins from backend).
 */
export function updateSettingsPackages(
  backendPlugins: PluginInfo[],
  settingsPlugins: PluginInfo[]
): PluginInfo[] {
  if (backendPlugins.length === 0) return [];

  // Create a unique key for each plugin (name + type)
  const getPluginKey = (plugin: PluginInfo) => `${plugin.name}@${plugin.type || 'unknown'}`;

  const pluginsChanged =
    backendPlugins.length !== settingsPlugins.length ||
    backendPlugins.map(p => getPluginKey(p) + p.version).join('') !==
      settingsPlugins.map(p => getPluginKey(p) + p.version).join('');

  if (!pluginsChanged) {
    return settingsPlugins;
  }

  return backendPlugins.map(plugin => {
    // Find matching plugin by name AND type
    const index = settingsPlugins.findIndex(x => x.name === plugin.name && x.type === plugin.type);

    if (index === -1) {
      // It's a new one settings doesn't know about, enable it by default
      return {
        ...plugin,
        isEnabled: true,
      };
    }

    // Merge settings with backend info, preserving user's isEnabled preference
    return {
      ...settingsPlugins[index],
      ...plugin,
      isEnabled: settingsPlugins[index].isEnabled,
    };
  });
}

/**
 * Runs a plugin with the given info.
 *
 * This is not a closure, so it doens't have access to the variables
 *  in the scope of the function that called it.
 */
function runPluginInner(info: runPluginProps) {
  // We avoid destructuring here in case that is overridden by a plugin.
  const source = info[0];
  const packageName = info[1];
  const packageVersion = info[2];
  const handleError = info[3];
  const PrivateFunction = info[4];
  const args = info[5];
  const values = info[6];
  const privateRunPlugin = info[7];

  privateRunPlugin(source, packageName, packageVersion, handleError, PrivateFunction, args, values);
}

const PLUGIN_LOADING_ERROR = HeadlampEventType.PLUGIN_LOADING_ERROR;
const consoleError = console.error;
const storeDispatch = store.dispatch;
const privateEventAction = eventAction;

/**
 * Handles the error that occurs when a plugin fails to run.
 *
 * @param error The error that occurred.
 * @param packageName The name of the package that failed.
 * @param packageVersion The version of the package that failed.
 */
function handlePluginRunError(error: unknown, packageName: string, packageVersion: string) {
  consoleError('Plugin execution error in ' + packageName + ':', error);
  storeDispatch(
    privateEventAction({
      type: PLUGIN_LOADING_ERROR,
      data: {
        pluginInfo: { name: packageName, version: packageVersion },
        error,
      },
    })
  );
}

/**
 * Retry with exponential backoff starting at 50ms, doubling each time and capped at 1000ms.
 * Retries continue until the total accumulated wait reaches 30 seconds.
 *
 * @param url The URL to fetch.
 * @param maxTotalWaitMs Maximum total wait time across retries (default 30000ms).
 * @param baseDelayMs Initial delay before first retry (default 50ms).
 * @param maxDelayMs Maximum delay per retry (default 1000ms).
 * @returns A promise that resolves to the response of the fetch request.
 */
async function fetchWithRetry(
  url: string,
  headers: HeadersInit,
  maxTotalWaitMs = 30000,
  baseDelayMs = 50,
  maxDelayMs = 1000
): Promise<Response> {
  let attempt = 0;
  let totalSlept = 0;
  let lastErr: unknown;

  while (totalSlept < maxTotalWaitMs) {
    try {
      const resp = await fetch(url, { headers: new Headers(headers) });
      if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
      return resp;
    } catch (err) {
      lastErr = err;
      const remaining = maxTotalWaitMs - totalSlept;
      if (remaining <= 0) break;

      const wait = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs, remaining);
      attempt++;
      await new Promise(res => setTimeout(res, wait));
      totalSlept += wait;
    }
  }

  throw lastErr ?? new Error('Fetch failed after retries');
}

/**
 * Get the list of plugins,
 *   download all the plugin source,
 *   download all the plugin package.json files,
 *   apply priority-based filtering (dev > user > shipped),
 *   filter incompatible plugins and respect enable/disable settings,
 *   execute only the highest priority enabled version of each plugin,
 *   initialize() plugins that register.
 *
 * @param settingsPackages The packages settings knows about.
 * @param onSettingsChange Called when the plugins are different to what is in settings.
 * @param onIncompatible Called when there are incompatible plugins.
 *
 */
export async function fetchAndExecutePlugins(
  settingsPackages: PluginInfo[],
  onSettingsChange: (plugins: PluginInfo[]) => void,
  onIncompatible: (plugins: Record<string, PluginInfo>) => void
) {
  const permissionSecretsPromise = permissionSecretsFromApp();

  const headers = addBackstageAuthHeaders();

  // Backend now returns plugin metadata with path, type, and name
  interface PluginMetadata {
    path: string;
    type: 'development' | 'user' | 'shipped';
    name: string;
  }

  const pluginMetadataList = (await fetchWithRetry(`${getAppUrl()}plugins`, headers).then(resp =>
    resp.json()
  )) as PluginMetadata[];

  // Extract paths for fetching plugin files
  const pluginPaths = pluginMetadataList.map(metadata => metadata.path);

  const sourcesPromise = Promise.all(
    pluginPaths.map(path =>
      fetch(`${getAppUrl()}${path}/main.js`, { headers: new Headers(headers) }).then(resp =>
        resp.text()
      )
    )
  );

  const packageInfosPromise = await Promise.all<PluginInfo>(
    pluginPaths.map((path, index) =>
      fetch(`${getAppUrl()}${path}/package.json`, { headers: new Headers(headers) }).then(resp => {
        if (!resp.ok) {
          if (resp.status !== 404) {
            return Promise.reject(resp);
          }
          {
            console.warn(
              'Missing package.json. ' +
                `Please upgrade the plugin ${path}` +
                ' by running "headlamp-plugin extract" again.' +
                ' Please use headlamp-plugin >= 0.8.0'
            );
            return {
              name: path.split('/').slice(-1)[0],
              version: '0.0.0',
              author: 'unknown',
              description: '',
              type: pluginMetadataList[index].type,
            };
          }
        }
        return resp.json().then(json => ({
          ...json,
          type: pluginMetadataList[index].type,
        }));
      })
    )
  );

  const sources = await sourcesPromise;
  const packageInfos = await packageInfosPromise;
  const permissionSecrets = await permissionSecretsPromise;

  // Update settings to include all plugin versions (by name + type)
  let updatedSettingsPackages = updateSettingsPackages(packageInfos, settingsPackages);

  // Apply priority-based loading logic
  updatedSettingsPackages = applyPluginPriority(updatedSettingsPackages);

  // Notify settings of changes
  onSettingsChange(updatedSettingsPackages);

  // Can set this to a semver version range like '>=0.8.0-alpha.3'.
  // '' means all versions.
  const compatibleHeadlampPluginVersion = '>=0.8.0-alpha.3';

  // Mark incompatible plugins
  const incompatiblePlugins: Record<string, PluginInfo> = {};
  updatedSettingsPackages = updatedSettingsPackages.map(plugin => {
    const isCompatible = semver.satisfies(
      semver.coerce(plugin.devDependencies?.['@kinvolk/headlamp-plugin']) || '',
      compatibleHeadlampPluginVersion
    );

    if (!isCompatible) {
      incompatiblePlugins[`${plugin.name}@${plugin.type}`] = plugin;
    }

    return {
      ...plugin,
      isCompatible,
    };
  });

  if (Object.keys(incompatiblePlugins).length > 0) {
    onIncompatible(incompatiblePlugins);
  }

  // Update settings with compatibility info
  onSettingsChange(updatedSettingsPackages);

  // Filter to only execute plugins that should be loaded
  // A plugin is executed if:
  // 1. It's marked as isLoaded=true (highest priority enabled version)
  // 2. It's compatible with this version of Headlamp
  // 3. In app mode, it must be enabled
  const pluginsToExecute = updatedSettingsPackages.filter(plugin => {
    // Must be marked as the version to load
    if (!plugin.isLoaded) {
      return false;
    }

    // Must be compatible
    if (!plugin.isCompatible) {
      return false;
    }

    // In app mode, must be enabled
    if (isElectron() && plugin.isEnabled === false) {
      return false;
    }

    return true;
  });

  // Get indices of plugins to execute for matching with sources
  const indicesToExecute = pluginsToExecute.map(plugin =>
    packageInfos.findIndex(p => p.name === plugin.name && p.type === plugin.type)
  );

  const sourcesToExecute = indicesToExecute.map(index => sources[index]);
  const pluginPathsToExecute = indicesToExecute.map(index => pluginPaths[index]);
  const packageInfosToExecute = indicesToExecute.map(index => packageInfos[index]);

  // Save references to the pluginRunCommand and desktopApiSend/Receive.
  // Plugins can use without worrying about modified global window.desktopApi.
  // This is to prevent plugins from snooping on the permission secrets.
  const pluginDesktopApiSend = window?.desktopApi?.send;
  const pluginDesktopApiReceive = window?.desktopApi?.receive;
  const internalRunCommand = runCommand;
  const PrivateFunction = Function;
  const internalRunPlugin = runPlugin;
  const isDevelopmentMode = process.env.NODE_ENV === 'development';
  const consoleError = console.error;

  const pluginsLoaded = updatedSettingsPackages
    .filter(plugin => plugin.isLoaded)
    .map(plugin => ({
      name: plugin.name,
      version: plugin.version,
      isEnabled: plugin.isEnabled,
      type: plugin.type,
    }));

  const infoForRunningPlugins = sourcesToExecute
    .map((source, index) => {
      return getInfoForRunningPlugins({
        source,
        pluginPath: pluginPathsToExecute[index],
        packageName: packageInfosToExecute[index].name,
        packageVersion: packageInfosToExecute[index].version || '',
        permissionSecrets,
        handleError: handlePluginRunError,
        getAllowedPermissions: (pluginName, pluginPath, secrets): Record<string, number> => {
          const secretsToReturn: Record<string, number> = {};
          const isPackage = identifyPackages(pluginPath, pluginName, isDevelopmentMode);
          if (isPackage['@headlamp-k8s/minikube']) {
            secretsToReturn['runCmd-minikube'] = secrets['runCmd-minikube'];
            if (isDevelopmentMode) {
              secretsToReturn['runCmd-scriptjs-minikube/manage-minikube.js'] =
                secrets['runCmd-scriptjs-minikube/manage-minikube.js'];
            }
            secretsToReturn['runCmd-scriptjs-headlamp_minikube/manage-minikube.js'] =
              secrets['runCmd-scriptjs-headlamp_minikube/manage-minikube.js'];
            secretsToReturn['runCmd-scriptjs-headlamp_minikubeprerelease/manage-minikube.js'] =
              secrets['runCmd-scriptjs-headlamp_minikubeprerelease/manage-minikube.js'];
          }

          return secretsToReturn;
        },
        getArgValues: (pluginName, pluginPath, allowedPermissions) => {
          // allowedPermissions is the return value of getAllowedPermissions
          const isPackage = identifyPackages(pluginPath, pluginName, isDevelopmentMode);
          if (isPackage['@headlamp-k8s/minikube']) {
            // We construct a pluginRunCommand that has private
            //  - permission secrets
            //  - stored desktopApiSend and desktopApiReceive functions that can't be modified
            function pluginRunCommand(
              command: 'minikube' | 'az' | 'scriptjs',
              args: string[],
              options: {}
            ): ReturnType<typeof internalRunCommand> {
              return internalRunCommand(
                command,
                args,
                options,
                allowedPermissions,
                pluginDesktopApiSend,
                pluginDesktopApiReceive
              );
            }
            return [
              ['pluginRunCommand', 'pluginPath'],
              [pluginRunCommand, pluginPath],
            ];
          }
          return [[], []];
        },
        PrivateFunction,
        internalRunPlugin,
        consoleError,
      });
    })
    .filter(info => info !== undefined);

  // put the ones with args and values at the start
  infoForRunningPlugins.sort((a, b) => {
    const aHasArgs = a[5].length > 0 && a[6].length > 0;
    const bHasArgs = b[5].length > 0 && b[6].length > 0;
    if (aHasArgs && !bHasArgs) return -1;
    if (!aHasArgs && bHasArgs) return 1;
    return 0;
  });

  infoForRunningPlugins.forEach(runPluginInner);

  // Initialize plugin i18n after plugins are loaded
  await initializePluginsI18n(packageInfos, pluginPaths);

  await afterPluginsRun(pluginsLoaded);
}

/**
 * Initialize i18n for all plugins that have i18n configuration
 */
async function initializePluginsI18n(packageInfos: PluginInfo[], pluginPaths: string[]) {
  for (let i = 0; i < packageInfos.length; i++) {
    const packageInfo = packageInfos[i];
    const pluginPath = pluginPaths[i];

    await initializePluginI18n(packageInfo.name, packageInfo, pluginPath);
  }

  // Set up language change synchronization
  i18next.on('languageChanged', language => {
    changePluginLanguage(language);
  });
}

/**
 * This is called after all plugins are loaded.
 * It initializes the plugins(that need it) and dispatches the PLUGINS_LOADED event.
 */
async function afterPluginsRun(
  pluginsLoaded: {
    name: string;
    version: string | undefined;
    isEnabled: boolean | undefined;
  }[]
) {
  await initializePlugins();

  store.dispatch(
    eventAction({
      type: HeadlampEventType.PLUGINS_LOADED,
      data: { plugins: pluginsLoaded },
    })
  );

  // Refresh theme name if the theme that was used from a plugin was deleted
  store.dispatch(themeSlice.actions.ensureValidThemeName());
}

/**
 * Asks the main electron process for the permission secrets.
 *
 * @returns promise with permissions secrets like { 'runCmd-minikube': 1235555 }
 */
export async function permissionSecretsFromApp(): Promise<Record<string, number>> {
  const { desktopApi } = window;
  if (desktopApi) {
    return new Promise(resolve => {
      desktopApi.receive('plugin-permission-secrets', (secrets: Record<string, number>) => {
        resolve(secrets);
      });
      desktopApi.send('request-plugin-permission-secrets');
    });
  } else {
    return new Promise(resolve => resolve({}));
  }
}
