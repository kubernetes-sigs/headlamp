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

import { runPlugin } from './index';

describe('runPlugin', () => {
  test('It should fail to access permissionSecrets defined in the test scope', () => {
    let theError: Error | null = null;
    let errorMessage = '';
    const theSecrets = {
      aPermissionName: 12345,
    };

    // This simulates a plugin that tries to access permissionSecrets
    //   but fails because it is not defined in the plugin context
    const pluginSource = 'theSecrets["aPermissionName"];';

    runPlugin({
      source: pluginSource,
      pluginPath: '/path/to/plugin',
      packageName: 'test-package',
      packageVersion: '1.0.0',
      permissionSecrets: theSecrets,
      handleError: (error, packageName, packageVersion) => {
        // It tried to access permissionSecrets but it is not defined in the plugin context
        //  so it should throw an error.
        errorMessage = `Error in plugin ${packageName} v${packageVersion}: ${error}`;
        theError = error as Error;
      },
      getAllowedPermissions: (): Record<string, number> => {
        // This plugin is NOT allowed to access any permissions
        return {};
      },
    });
    expect(errorMessage).not.toBe('');
    expect(theError + '').toContain('theSecrets is not defined');
  });

  test('It should pass the permissionSecrets if the getAllowedPermissions matches the plugin', () => {
    let anError = false;

    // This simulates a plugin that tries to access permissionSecrets
    //   but fails because it is not defined in the plugin context
    const theSecrets = {
      aPermissionName: 12345,
    };

    runPlugin({
      source:
        'pluginPermissionSecrets["aPermissionName"]; // pluginPermissionSecrets var is available to plugins',
      pluginPath: '/path/to/plugin',
      packageName: 'test-package',
      packageVersion: '1.0.0',
      permissionSecrets: theSecrets,
      handleError: () => {
        anError = true;
      },
      getAllowedPermissions: (
        packageName: string,
        pluginPath: string,
        permissionSecrets: Record<string, number>
      ): Record<string, number> => {
        if (packageName === 'test-package' && pluginPath === '/path/to/plugin') {
          // This plugin IS allowed to access the aPermissionName secret
          return {
            aPermissionName: permissionSecrets['aPermissionName'],
          };
        }
        return {};
      },
    });
    expect(anError).toBe(false);
  });
});
