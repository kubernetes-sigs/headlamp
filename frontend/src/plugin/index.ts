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
 * Gives back updates settings from the backend.
 *
 * If there are new plugins, it includes the new ones with isEnabled=true.
 *
 * If plugins are not there anymore in the backend list,
 * then it removes them from the settings list of plugins.
 *
 * @param backendPlugins the list of plugins info from the backend.
 * @param settingsPlugins the list of plugins the settings already knows about.
 * @returns plugin info for the settings.
 */
export function updateSettingsPackages(
  backendPlugins: PluginInfo[],
  settingsPlugins: PluginInfo[]
): PluginInfo[] {
  if (backendPlugins.length === 0) return [];

  const pluginsChanged =
    backendPlugins.length !== settingsPlugins.length ||
    backendPlugins.map(p => p.name + p.version).join('') !==
      settingsPlugins.map(p => p.name + p.version).join('');

  if (!pluginsChanged) {
    return settingsPlugins;
  }

  return backendPlugins.map(plugin => {
    const index = settingsPlugins.findIndex(x => x.name === plugin.name);
    if (index === -1) {
      // It's a new one settings doesn't know about so we do not enable it by default
      return {
        ...plugin,
        isEnabled: true,
      };
    }
    return {
      ...settingsPlugins[index],
      ...plugin,
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
 * Retry 8 times starting at 0.05 seconds, doubling the delay each time.
 * The total wait time is 0.05 + 0.1 + 0.2 + 0.4 + 0.8 + 1.6 + 3.2 + 6.4 = 12.75 seconds.
 *
 * @param url The URL to fetch.
 * @param retries The number of retries to attempt.
 * @param delay The initial delay in milliseconds.
 * @returns A promise that resolves to the response of the fetch request.
 */
async function fetchWithRetry(url: string, retries = 8, delay = 50): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      // const brokenFiveTimes = i < 5 ? 'xx' + url : url; // for debugging
      // const resp = await fetch(brokenFiveTimes);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP error: ${resp.status}`);
      return resp;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
    }
  }
}

/**
 * Get the list of plugins,
 *   download all the plugin source,
 *   download all the plugin package.json files,
 *   ask app for permission secrets,
 *   filter the sources to execute,
 *   filter the incompatible plugins and plugins enabled in settings,
 *   execute the plugins,
 *   .initialize() plugins that register (not all do).
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

  const pluginPaths = (await fetchWithRetry(`${getAppUrl()}plugins`).then(resp =>
    resp.json()
  )) as string[];

  const sourcesPromise = Promise.all(
    pluginPaths.map(path => fetch(`${getAppUrl()}${path}/main.js`).then(resp => resp.text()))
  );

  const packageInfosPromise = await Promise.all<PluginInfo>(
    pluginPaths.map(path =>
      fetch(`${getAppUrl()}${path}/package.json`).then(resp => {
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
            };
          }
        }
        return resp.json();
      })
    )
  );

  const sources = await sourcesPromise;
  const packageInfos = await packageInfosPromise;
  const permissionSecrets = await permissionSecretsPromise;

  const updatedSettingsPackages = updateSettingsPackages(packageInfos, settingsPackages);
  const settingsChanged = packageInfos.length !== settingsPackages.length;
  if (settingsChanged) {
    onSettingsChange(updatedSettingsPackages);
  }

  // Can set this to a semver version range like '>=0.8.0-alpha.3'.
  // '' means all versions.
  const compatibleHeadlampPluginVersion = '>=0.8.0-alpha.3';

  const { sourcesToExecute, incompatiblePlugins } = filterSources(
    sources,
    packageInfos,
    isElectron(),
    compatibleHeadlampPluginVersion,
    updatedSettingsPackages
  );

  if (Object.keys(incompatiblePlugins).length > 0) {
    onIncompatible(incompatiblePlugins);
  }

  const packagesIncompatibleSet: PluginInfo[] = updatedSettingsPackages.map(
    (plugin: PluginInfo) => {
      return {
        ...plugin,
        isCompatible: !incompatiblePlugins[plugin.name],
      };
    }
  );
  onSettingsChange(packagesIncompatibleSet);

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

  const pluginsLoaded = updatedSettingsPackages.map(plugin => ({
    name: plugin.name,
    version: plugin.version,
    isEnabled: plugin.isEnabled,
  }));

  const infoForRunningPlugins = sourcesToExecute
    .map((source, index) => {
      return getInfoForRunningPlugins({
        source,
        pluginPath: pluginPaths[index],
        packageName: packageInfos[index].name,
        packageVersion: packageInfos[index].version || '',
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
