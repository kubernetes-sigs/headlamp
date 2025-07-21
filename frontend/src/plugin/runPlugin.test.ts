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

import { getInfoForRunningPlugins, runPlugin, runPluginProps } from './runPlugin';

function runPluginInner(info: runPluginProps) {
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
    const PrivateFunction = Function;
    const consoleError = console.error;
    const internalRunPlugin = runPlugin;

    const info = getInfoForRunningPlugins({
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
      getArgValues() {
        return [[], []];
      },
      PrivateFunction,
      internalRunPlugin,
      consoleError,
    });
    if (info !== undefined) {
      runPluginInner(info);
    }
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
    const consoleError = console.error;
    const internalRunPlugin = runPlugin;

    const PrivateFunction = Function;
    const info = getInfoForRunningPlugins({
      source:
        'pluginPermissionSecrets["aPermissionName"]; // pluginPermissionSecrets var is available to plugins',
      pluginPath: '/path/to/plugin',
      packageName: 'test-package',
      packageVersion: '1.0.0',
      permissionSecrets: theSecrets,
      handleError: () => {
        // never called, because the plugin should not throw an error
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
      getArgValues(pluginName, pluginPath, allowedPermissions) {
        return [['pluginPermissionSecrets'], [allowedPermissions]];
      },
      PrivateFunction,
      internalRunPlugin,
      consoleError,
    });
    if (info !== undefined) {
      runPluginInner(info);
    }
    expect(anError).toBe(false);
  });

  test('It should not allow a plugin to intercept and run pluginRunCommand via Function override', () => {
    let errorMessage = '';
    let theError: Error | null = null;
    const PrivateFunction = Function;

    // First plugin: maliciously overrides Function to intercept pluginRunCommand
    const overrideFunctionSource = `
      const original = Function;
      Function = function(...args) {
        const func = new original(...args);
        return (...params) => {
          if (typeof params[0] === "function" && params[0].name === "pluginRunCommand") {
            // Try to run command as a minikube plugin
            params[0]('minikube', ['delete'], {});
          }
          return func(...params);
        }
      };
      Function.prototype = original.prototype;
    `;

    let pluginRunCommandCalled = false;
    function pluginRunCommand(cmd: string, args: string[], opts: object) {
      console.log('pluginRunCommand called with, cmd:', cmd, 'args:', args, 'opts:', opts);
      pluginRunCommandCalled = true;
    }
    const consoleError = console.error;
    const internalRunPlugin = runPlugin;

    // Run the first plugin that overrides Function
    const info = getInfoForRunningPlugins({
      source: overrideFunctionSource,
      pluginPath: '/path/to/plugin1',
      packageName: 'evil-plugin',
      packageVersion: '1.0.0',
      permissionSecrets: {},
      handleError: (error, packageName, packageVersion) => {
        errorMessage = `Error in plugin ${packageName} v${packageVersion}: ${error}`;
        theError = error as Error;
      },
      getAllowedPermissions: () => ({}),
      getArgValues() {
        return [[], []];
      },
      PrivateFunction,
      internalRunPlugin,
      consoleError,
    });
    if (info !== undefined) {
      runPluginInner(info);
    }

    // Reset error state before running second plugin
    errorMessage = '';
    theError = null;

    // Run the second plugin, passing a fake pluginRunCommand
    const usePluginRunCommandSource = `
      // No error thrown proves that pluginRunCommand is there.
      if (typeof pluginRunCommand !== 'function') {
        throw new Error('pluginRunCommand is not defined');
      }
    `;

    const info2 = getInfoForRunningPlugins({
      source: usePluginRunCommandSource,
      pluginPath: '/path/to/plugin2',
      packageName: 'good-plugin-with-permission',
      packageVersion: '1.0.0',
      permissionSecrets: { 'runCmd-minikube': 123 },
      handleError: (error, packageName, packageVersion) => {
        // There is no error, which proves that pluginRunCommand is available
        errorMessage = `Error in plugin ${packageName} v${packageVersion}: ${error}`;
        theError = error as Error;
      },
      getAllowedPermissions: () => ({ 'runCmd-minikube': 123 }),
      getArgValues() {
        return [['pluginRunCommand'], [pluginRunCommand]];
      },
      PrivateFunction,
      // PrivateFunction: Function, // If we pass Function it will use overriden Function
      internalRunPlugin,
      consoleError,
    });
    if (info2 !== undefined) {
      runPluginInner(info2);
    }

    // The malicious override should not have affected the second plugin's context
    // So the pluginRunCommand should not have been called
    expect(pluginRunCommandCalled).toBe(false);
    // The second plugin should not throw an error
    expect(errorMessage).toBe('');
    expect(theError).toBe(null);

    // Restore global Function to its original state
    (globalThis as any).Function = PrivateFunction;
  });

  test('It should not allow a plugin to intercept pluginRunCommand via Array.prototype[Symbol.iterator] override', () => {
    const originalIterator = Array.prototype[Symbol.iterator];
    // You can make this test fail by changing the line inside runPlugin to do this:
    //   const [args, values] = getArgValues(packageName, pluginPath, allowedPermissions);
    let errorMessage = '';
    let theError: Error | null = null;
    const PrivateFunction = Function;
    const consoleError = console.error;
    const internalRunPlugin = runPlugin;

    (globalThis as any).iteratorRun = false;

    let pluginRunCommandCalled = false;
    function pluginRunCommand(cmd: string, args: string[], opts: object) {
      // This is only called if the malicious plugin works
      console.log('pluginRunCommand called with, cmd:', cmd, 'args:', args, 'opts:', opts);
      pluginRunCommandCalled = true;
    }

    // Malicious plugin tries to override Array.prototype[Symbol.iterator]
    const overrideArrayIteratorSource = `
      const realArrayIterator = Array.prototype[Symbol.iterator];
      Array.prototype[Symbol.iterator] = function* () {
        if(this[0]?.[0] === 'pluginRunCommand') {
          iteratorRun = true;
        }
        yield* realArrayIterator.call(this);
      };
    `;

    // Run the malicious plugin
    const info = getInfoForRunningPlugins({
      source: overrideArrayIteratorSource,
      pluginPath: '/path/to/plugin-malicious',
      packageName: 'evil-plugin-array-iterator',
      packageVersion: '1.0.0',
      permissionSecrets: {},
      handleError: (error, packageName, packageVersion) => {
        errorMessage = `Error in plugin ${packageName} v${packageVersion}: ${error}`;
        theError = error as Error;
      },
      getAllowedPermissions: () => ({}),
      getArgValues() {
        return [[], []];
      },
      PrivateFunction,
      internalRunPlugin,
      consoleError,
    });
    if (info !== undefined) {
      runPluginInner(info);
    }

    // Reset error state before running the next plugin
    errorMessage = '';
    theError = null;

    // Run a normal plugin that uses pluginRunCommand
    const info2 = getInfoForRunningPlugins({
      source: `
        const arr = [[1, 2], [3, 4]];
        const iterated = Array.from(arr);
        const [args, values] = arr;

        if (typeof pluginRunCommand !== 'function') {
          throw new Error('pluginRunCommand is not defined');
        }
      `,
      pluginPath: '/path/to/plugin-safe',
      packageName: 'good-plugin',
      packageVersion: '1.0.0',
      permissionSecrets: { 'runCmd-minikube': 123 },
      handleError: (error, packageName, packageVersion) => {
        // There is no error, which proves that pluginRunCommand is available
        errorMessage = `Error in plugin ${packageName} v${packageVersion}: ${error}`;
        theError = error as Error;
      },
      getAllowedPermissions: () => ({ 'runCmd-minikube': 123 }),
      getArgValues() {
        return [['pluginRunCommand'], [pluginRunCommand]];
      },
      PrivateFunction,
      internalRunPlugin,
      consoleError,
    });
    if (info2 !== undefined) {
      runPluginInner(info2);
    }

    // The malicious plugin should not have been able to intercept pluginRunCommand
    expect((globalThis as any).iteratorRun).toBe(false);
    expect(pluginRunCommandCalled).toBe(false);
    expect(errorMessage).toBe('');
    expect(theError).toBe(null);

    // restore Array.prototype[Symbol.iterator]
    (globalThis as any).Array.prototype[Symbol.iterator] = originalIterator;
  });
});
