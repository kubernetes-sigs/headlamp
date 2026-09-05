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

// Capture the intrinsics before any plugin runs. Spread syntax in either
// `new PrivateFunction(...args, source)` or `executePlugin(...values)` would look
// up the array iterator at use time. An earlier plugin can replace that iterator
// to rewrite a later plugin's formal parameters or observe its private values.
// Reflect.construct and Reflect.apply consume indexed array-like objects without
// invoking their iterators. Object.create builds that argument list without an
// inherited prototype. These captured references cannot be replaced by a plugin
// after module initialization.
const privateApply = Reflect.apply;
const privateConstruct = Reflect.construct;
const privateCreate = Object.create;

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
 * Adjusts inline source maps for code that will be executed via `new Function()`.
 *
 * When using `new Function(args, body)`, the browser wraps the code in a function declaration,
 * adding 2 extra lines (function header and closing brace). This causes source map line numbers
 * to be off by 2. We fix this by prepending semicolons to the mappings field - each semicolon
 * represents an empty generated line, effectively shifting all mappings down.
 */
export function adjustSourceMapOffsetForFunction(jsSource: string) {
  try {
    const marker = '//# sourceMappingURL=data:application/json;charset=utf-8;base64,';
    const markerIndex = jsSource.lastIndexOf(marker);

    if (markerIndex === -1) {
      return jsSource;
    }

    const base64Start = markerIndex + marker.length;
    const base64Data = jsSource.slice(base64Start).split(/[\s\n]/)[0];

    const sourceMap = JSON.parse(atob(base64Data));

    if (typeof sourceMap.mappings !== 'string') {
      return jsSource;
    }

    const wrapperLineCount = 2;
    sourceMap.mappings = ';'.repeat(wrapperLineCount) + sourceMap.mappings;

    const newBase64 = btoa(JSON.stringify(sourceMap));
    const newSourceMapComment = `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${newBase64}`;

    const before = jsSource.slice(0, markerIndex);
    const after = jsSource.slice(base64Start + base64Data.length);

    return before + newSourceMapComment + after;
  } catch (error) {
    console.error('Failed to adjust source map offset', error);
    return jsSource;
  }
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
  // Build the Function constructor argument list by index. Iterating `args`
  // would let an earlier plugin replace a parameter name with destructuring code
  // that exports a private value while the generated function binds arguments.
  // A null prototype prevents inherited numeric getters or setters from changing
  // the parameter strings written to and read from this array-like object.
  const constructorArgs = privateCreate(null) as Record<number, string> & { length: number };
  constructorArgs.length = args.length + 1;
  for (let index = 0; index < args.length; index += 1) {
    constructorArgs[index] = args[index];
  }
  constructorArgs[args.length] = adjustSourceMapOffsetForFunction(source);

  // Use the private Function reference and avoid the mutable array iterator.
  const executePlugin = privateConstruct(PrivateFunction, constructorArgs) as Function;

  try {
    // This executes in the global scope,
    //   so the plugin can't access variables in this scope.
    // Meaning, it can NOT access "permissionSecrets".
    // Each plugin gets its own "pluginPermissionSecrets" which contains only the secrets
    //   that it is allowed to access.
    // Avoid spread syntax here: it would expose values to a mutable global array
    // iterator. `undefined` is the receiver because generated plugin functions do
    // not use a privileged `this`; `values` becomes their positional arguments.
    privateApply(executePlugin, undefined, values);
  } catch (e) {
    handleError(e, packageName, packageVersion);
  }
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
    'azure-aks': ['plugins/azure-aks', 'static-plugins/azure-aks', 'user-plugins/azure-aks'],
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
    'azure-aks': ['azure-aks'],
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
