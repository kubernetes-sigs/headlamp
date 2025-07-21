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

export type runPluginProps = [
  source: string,
  packageName: string,
  packageVersion: string,
  handleError: (error: unknown, packageName: string, packageVersion: string) => void,
  PrivateFunction: typeof Function,
  args: string[],
  values: unknown[],
  internalRunPlugin: typeof runPlugin,
  consoleError: typeof console.error
];

/**
 * Runs a plugin by executing the source code in the global scope.
 *
 * This provides a way to pass private variables to individual plugins.
 *
 * @param source source code of plugin
 * @param pluginPath path to plugin
 * @param packageName name of package
 * @param packageVersion version of package
 * @param permissionSecrets permission secrets are keyed by permission name, valued by secret
 * @param handleError call back when an execution error occurs in the plugin
 * @param getAllowedPermissions call back which returns only allowed permission secrets for plugin
 * @param getArgValues call back which returns the argument names and values for the plugin
 * @param privateFunction is a non global private copy of Function
 */
export function getInfoForRunningPlugins({
  source,
  pluginPath,
  packageName,
  packageVersion,
  permissionSecrets,
  handleError,
  getAllowedPermissions,
  getArgValues,
  PrivateFunction,
  internalRunPlugin,
  consoleError,
}: {
  source: string;
  pluginPath: string;
  packageName: string;
  packageVersion: string;
  permissionSecrets: Record<string, number>;
  handleError: (error: unknown, packageName: string, packageVersion: string) => void;
  getAllowedPermissions: (
    pluginName: string,
    pluginPath: string,
    permissionSecrets: Record<string, number>
  ) => Record<string, number>;
  getArgValues: (
    pluginName: string,
    pluginPath: string,
    allowedPermissions: Record<string, number>
  ) => [string[], unknown[]];
  PrivateFunction: typeof Function;
  internalRunPlugin: typeof runPlugin;
  consoleError: typeof console.error;
}): runPluginProps | undefined {
  if (!pluginPath || !packageName || !packageVersion) {
    consoleError(`Either pluginPath, packageName or packageVersion is missing for ${pluginPath}`);
    return;
  }

  const sourceMapPathForDebugging = `\n//# sourceURL=//${pluginPath}/dist/main.js`;
  const allowedPermissions = getAllowedPermissions(packageName, pluginPath, permissionSecrets);
  const argsValues = getArgValues(packageName, pluginPath, allowedPermissions);
  const args = argsValues[0];
  const values = argsValues[1];

  return [
    source + sourceMapPathForDebugging,
    packageName,
    packageVersion,
    handleError,
    PrivateFunction,
    args,
    values,
    internalRunPlugin,
    consoleError,
  ];
}

export function runPlugin(
  source: string,
  packageName: string,
  packageVersion: string,
  handleError: (error: unknown, packageName: string, packageVersion: string) => void,
  PrivateFunction: typeof Function,
  args: string[],
  values: unknown[]
): void {
  // We use PrivateFunction here instead of global Function so people can't
  //   override Function and snoop on it.
  const executePlugin = new PrivateFunction(...args, source);

  try {
    // This executes in the global scope,
    //   so the plugin can't access variables in this scope.
    // Meaning, it can NOT access "permissionSecrets".
    // Each plugin gets its own "pluginPermissionSecrets" which contains only the secrets
    //   that it is allowed to access.
    executePlugin(...values);
  } catch (e) {
    handleError(e, packageName, packageVersion);
  }
}
