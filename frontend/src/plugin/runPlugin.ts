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
 * This is as a list of parameters to be passed to the `runPlugin` function.
 * To reduce the ability of overridden prototypes from snooping on data,
 * if it is destructured.
 *
 * @param pluginPath path to plugin
 * @param packageName name of package
 * @param packageVersion version of package
 * @param permissionSecrets permission secrets are keyed by permission name, valued by secret
 * @param handleError call back when an execution error occurs in the plugin
 * @param getAllowedPermissions call back which returns only allowed permission secrets for plugin
 * @param getArgValues call back which returns the argument names and values for the plugin
 * @param privateFunction is a non global private copy of Function
 *
 */
export type runPluginProps = [
  /** path to plugin */
  source: string,
  /** name of package */
  packageName: string,
  /** version of package */
  packageVersion: string,
  /** call back when an execution error occurs in the plugin */
  handleError: (error: unknown, packageName: string, packageVersion: string) => void,
  /** is a non global private copy of Function */
  PrivateFunction: typeof Function,
  /** The argument names to be given to the plugin */
  args: string[],
  /** The values for the arguments to be given to the plugin */
  values: unknown[],
  /** A private copy of runPlugin */
  internalRunPlugin: typeof runPlugin,
  /** A private copy of console.error */
  consoleError: typeof console.error
];

/**
 * Prepares the information needed to run a plugin with the `runPlugin` function.
 *
 * This function gathers the necessary details such as source code, package name,
 * version, and permissions, and returns them in a structured format that can be
 * used to execute the plugin with the `runPlugin` function.
 *
 * This is a separate step to reduce the amount of information available to the `runPlugin` function.
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

  // Using an array here because it's a bit safer than an object for this use.
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

/**
 * Runs a plugin by executing the source code in the global scope.
 *
 * This provides a way to pass private variables to individual plugins.
 *
 * @param source source code of plugin
 * @param packageName name of package
 * @param packageVersion version of package
 * @param handleError call back when an execution error occurs in the plugin
 * @param PrivateFunction is a non global private copy of Function
 * @param args The argument names to be given to the plugin
 * @param values The values for the arguments to be given to the plugin
 *
 * @see getInfoForRunningPlugins for more details
 */
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

/**
 * The ArtifactHub repository name that the official `@headlamp-k8s` plugins
 * (minikube, ai-assistant) are published under. Only plugins installed from
 * this repository are trusted with elevated `runCmd-*` secrets.
 *
 * @see https://artifacthub.io/packages/headlamp/headlamp-plugins/headlamp_ai_assistant
 */
export const OFFICIAL_HEADLAMP_PLUGINS_ARTIFACTHUB_REPO = 'headlamp-plugins';

/**
 * Describes where a plugin actually came from, so permission grants can be bound
 * to that provenance rather than to the plugin's self-reported path/name alone.
 */
export interface PluginOrigin {
  /**
   * "shipped" (bundled with the Headlamp binary) and "development" (loaded from
   * a local dev plugins folder) are both filesystem locations a remote attacker
   * can't write to, so they're inherently trusted.
   */
  type: 'development' | 'user' | 'shipped' | undefined;
  /**
   * For a "user"-installed plugin, the ArtifactHub repository it was installed
   * from (`package.json`'s `artifacthub.repoName`, set by the installer). This is
   * controlled by ArtifactHub's own repository registration, not by the plugin's
   * own package.json name, so a look-alike package published under a different
   * repository won't match it.
   */
  artifacthubRepoName?: string;
}

/**
 * Determines which `runCmd-*` permission secrets a plugin is allowed to receive,
 * based on which official package it was identified as (if any) AND whether its
 * actual origin can be trusted to be that package.
 *
 * `pluginPath`/`pluginName` alone are not enough: both come from the plugin's own
 * `package.json` and folder name, which a plugin published under a different,
 * arbitrary ArtifactHub repository can freely set to match
 * `@headlamp-k8s/ai-assistant` / `user-plugins/headlamp_ai-assistant` and so
 * masquerade as the official plugin. `pluginOrigin` is derived independently:
 * "shipped"/"development" plugins live in filesystem locations only Headlamp
 * itself can populate, and "user"-installed plugins are checked against the
 * ArtifactHub repository they actually came from.
 *
 * This is the permission boundary that decides, for example, that only the
 * official `@headlamp-k8s/ai-assistant` package is handed the `runCmd-aws` secret,
 * and that an arbitrary/unrecognised plugin gets no `runCmd-*` secrets at all.
 *
 * @param pluginPath is like "plugins/headlamp-pod-counter"
 * @param pluginName is like "@headlamp-k8s/minikube"
 * @param secrets all available permission secrets, keyed by permission name
 * @param isDevelopmentMode whether Headlamp is running in development mode
 * @param pluginOrigin where the plugin actually came from, used to verify provenance
 * @returns only the secrets the identified package is allowed to access
 */
export function getAllowedRunCmdPermissions(
  pluginPath: string,
  pluginName: string,
  secrets: Record<string, number>,
  isDevelopmentMode: boolean,
  pluginOrigin: PluginOrigin
): Record<string, number> {
  const secretsToReturn: Record<string, number> = {};
  const isPackage = identifyPackages(pluginPath, pluginName, isDevelopmentMode);

  const isTrustedOrigin =
    pluginOrigin.type === 'shipped' ||
    pluginOrigin.type === 'development' ||
    (pluginOrigin.type === 'user' &&
      pluginOrigin.artifacthubRepoName === OFFICIAL_HEADLAMP_PLUGINS_ARTIFACTHUB_REPO);

  if (!isTrustedOrigin) {
    return secretsToReturn;
  }

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

  if (isPackage['@headlamp-k8s/ai-assistant']) {
    secretsToReturn['runCmd-gh'] = secrets['runCmd-gh'];
    secretsToReturn['runCmd-az'] = secrets['runCmd-az'];
    secretsToReturn['runCmd-aws'] = secrets['runCmd-aws'];
  }

  return secretsToReturn;
}

/**
 * Identifies which packages this is, taking into account prereleases, and development mode.
 *
 * @param pluginPath is like "plugins/headlamp-pod-counter"
 * @param pluginName is like "@headlamp-k8s/minikube"
 * @param isDevelopmentMode
 * @returns the packages with { '@headlamp-k8s/minikube': true }
 *
 * @example
 * > identifyPackages('plugins/headlamp_minikube', '@headlamp-k8s/minikube', false)
 * { '@headlamp-k8s/minikube': true }
 */
export function identifyPackages(
  pluginPath: string,
  pluginName: string,
  isDevelopmentMode: boolean
): Record<string, boolean> {
  // Normalize path for Windows compatibility
  const pluginPathNormalized = pluginPath
    .replace(/plugins[\\/]/, 'plugins/')
    .replace(/static-plugins[\\/]/, 'static-plugins/')
    .replace(/user-plugins[\\/]/, 'user-plugins/');

  // For artifacthub installed packages, the package name is the folder name.
  // The ArtifactHub installer converts hyphens to underscores in folder names,
  // so 'headlamp_ai-assistant' (hyphen) and 'headlamp_ai_assistant' (underscore)
  // must both be recognised.
  const pluginPaths: Record<string, string[]> = {
    '@headlamp-k8s/minikube': [
      'plugins/headlamp_minikube',
      'user-plugins/headlamp_minikube',
      'static-plugins/headlamp_minikube',
      'plugins/headlamp_minikubeprerelease',
      'user-plugins/headlamp_minikubeprerelease',
      'static-plugins/headlamp_minikubeprerelease',
    ],
    '@headlamp-k8s/ai-assistant': [
      'plugins/headlamp_ai-assistant',
      'user-plugins/headlamp_ai-assistant',
      'static-plugins/headlamp_ai-assistant',
      'plugins/headlamp_ai-assistantprerelease',
      'user-plugins/headlamp_ai-assistantprerelease',
      'static-plugins/headlamp_ai-assistantprerelease',
      // Underscore variants: ArtifactHub installer converts hyphens to underscores
      'plugins/headlamp_ai_assistant',
      'user-plugins/headlamp_ai_assistant',
      'static-plugins/headlamp_ai_assistant',
      'plugins/headlamp_ai_assistantprerelease',
      'user-plugins/headlamp_ai_assistantprerelease',
      'static-plugins/headlamp_ai_assistantprerelease',
    ],
  };

  if (isDevelopmentMode) {
    pluginPaths['@headlamp-k8s/minikube'][pluginPaths['@headlamp-k8s/minikube'].length] =
      'plugins/minikube';
    pluginPaths['@headlamp-k8s/ai-assistant'].push(
      'plugins/ai-assistant',
      'plugins/ai-assistantprerelease'
    );
  }
  const pluginPackageNames: Record<string, string[]> = {
    '@headlamp-k8s/minikube': ['@headlamp-k8s/minikube', '@headlamp-k8s/minikubeprerelease'],
    '@headlamp-k8s/ai-assistant': [
      '@headlamp-k8s/ai-assistant',
      '@headlamp-k8s/ai-assistantprerelease',
    ],
  };
  const isPackage: Record<string, boolean> = {};
  for (const key in pluginPaths) {
    let foundPath = false;
    for (let i = 0; i < pluginPaths[key].length; i++) {
      if (pluginPaths[key][i] === pluginPathNormalized) {
        foundPath = true;
        break;
      }
    }
    let foundName = false;
    for (let i = 0; i < pluginPackageNames[key].length; i++) {
      if (pluginPackageNames[key][i] === pluginName) {
        foundName = true;
        break;
      }
    }
    isPackage[key] = foundPath && foundName;
  }
  return isPackage;
}
