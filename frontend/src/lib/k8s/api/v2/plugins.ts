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

import '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import semver from 'semver';
import { getAppUrl } from '../../../../helpers/getAppUrl';
import { PluginInfo, PluginSettings } from '../../../../plugin/pluginsSlice';
import { backendFetch } from './fetch';

/*
 * this function is used to check the compatibility of the plugin version with the headlamp version
 *
 * @param compatibleVersion headlamp-plugin version this build is compatible with.
 *     If the plugin engine version is not compatible, the plugin will not be loaded.
 *     Can be set to a semver range, e.g. '>= 0.6.0' or '0.6.0 - 0.7.0'.
 *     If set to an empty string, all plugin versions will be loaded.
 */
export function checkCompatibleVersion(packageInfo: PluginInfo, checkAllVersions: boolean = false) {
  /*
   * this is the compatible version of the plugin with the headlamp version
   */
  const compatibleVersion = !checkAllVersions ? '>=0.8.0-alpha.3' : '';

  // Can set this to a semver version range like '>=0.8.0-alpha.3'.
  // '' means all versions.
  const isCompatible = semver.satisfies(
    semver.coerce(packageInfo.devDependencies?.['@kinvolk/headlamp-plugin']) || '',
    compatibleVersion
  );

  return isCompatible;
}

export async function getPluginPaths() {
  const pluginPaths = (await fetch(`${getAppUrl()}plugins`).then(resp => resp.json())) as string[];

  return pluginPaths;
}

/*
 * this function is used for the plugin settings and is extended from the original `fetchAndExecutePlugins` function in the Plugins.tsx file
 * - the function is used to fetch the plugins from the backend and return the plugins with their settings
 * - it will also do a compatibility check for the plugins and return the plugins with their compatibility status,
 * - the compatibility check is needed to render the plugin switches
 */
export async function getPlugins(pluginSettings: PluginSettings[]) {
  const pluginPaths = await getPluginPaths();

  const packageInfosPromise = await Promise.all<PluginInfo>(
    pluginPaths.map(path =>
      backendFetch(`${path}/package.json`).then(resp => {
        if (!resp.ok) {
          if (resp.status !== 404) {
            return Promise.reject(resp);
          }

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
        return resp.json();
      })
    )
  );

  const packageInfos = await packageInfosPromise;

  const pluginsWithIsEnabled = packageInfos.map(plugin => {
    const matchedSetting = pluginSettings.find(p => plugin.name === p.name);
    if (matchedSetting) {
      const isCompatible = checkCompatibleVersion(plugin);

      return {
        ...plugin,
        settingsComponent: matchedSetting.settingsComponent,
        displaySettingsComponentWithSaveButton:
          matchedSetting.displaySettingsComponentWithSaveButton,
        isEnabled: matchedSetting.isEnabled,
        isCompatible: isCompatible,
      };
    }
    return plugin;
  });

  return pluginsWithIsEnabled;
}

export function usePlugins(pluginSettings: { name: string; isEnabled: boolean }[]) {
  // takes two params, the key and the function that will be called to get the data
  return useQuery({ queryKey: ['plugins'], queryFn: () => getPlugins(pluginSettings) });
}
