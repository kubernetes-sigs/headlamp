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

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { readProductMetadata } from '../scripts/product-metadata';

/** Electron application methods needed to apply runtime product identity. */
type RuntimeAppIdentity = Pick<
  Electron.App,
  'getName' | 'getPath' | 'isPackaged' | 'setName' | 'setPath'
> & {
  commandLine: Pick<Electron.CommandLine, 'hasSwitch'>;
};

type RuntimeManifestEnvironment = {
  HEADLAMP_BUILD_MANIFEST?: string;
};

/**
 * Resolves the build manifest available to the Electron runtime.
 *
 * @param runtimeApp Electron application whose packaging state selects the default path.
 * @param env Environment variables used to select an external development manifest.
 * @param cwd Directory used to resolve a relative development manifest path.
 * @param resourcesPath Electron's packaged resource directory.
 * @returns The selected development manifest or packaged resource manifest path.
 */
export function resolveRuntimeBuildManifestPath(
  runtimeApp: Pick<RuntimeAppIdentity, 'isPackaged'>,
  env: RuntimeManifestEnvironment = {
    HEADLAMP_BUILD_MANIFEST: process.env.HEADLAMP_BUILD_MANIFEST,
  },
  cwd: string = process.cwd(),
  resourcesPath: string = process.resourcesPath
): string {
  if (!runtimeApp.isPackaged && env.HEADLAMP_BUILD_MANIFEST) {
    return path.resolve(cwd, env.HEADLAMP_BUILD_MANIFEST);
  }
  return runtimeApp.isPackaged
    ? path.join(resourcesPath, 'app-build-manifest.json')
    : path.resolve(cwd, 'app-build-manifest.json');
}

/**
 * Selects the plugin profile shared with the backend and plugin development tooling.
 *
 * @param appName Electron application name used for packaged plugin storage.
 * @param isDevelopment Whether Electron is running in development mode.
 * @returns The Headlamp development profile or the packaged application name.
 */
export function pluginConfigDirName(appName: string, isDevelopment: boolean): string {
  return isDevelopment ? 'Headlamp' : appName;
}

/**
 * Applies the product manifest's display name before storage paths are resolved.
 *
 * @param runtimeApp Electron application whose runtime identity should be updated.
 * @param manifest Build manifest containing optional product metadata.
 * @returns The configured product name, or the existing Electron application name.
 */
export function applyRuntimeProductIdentity(
  runtimeApp: RuntimeAppIdentity,
  manifest: unknown
): string {
  const { productName } = readProductMetadata(manifest) ?? {};
  if (productName) {
    const packageName = runtimeApp.getName();
    const userDataPath = runtimeApp.getPath('userData');
    runtimeApp.setName(productName);
    if (
      !runtimeApp.commandLine.hasSwitch('user-data-dir') &&
      path.basename(userDataPath) === packageName
    ) {
      runtimeApp.setPath('userData', path.join(path.dirname(userDataPath), productName));
    }
    return productName;
  }
  return runtimeApp.getName();
}

const manifestPath = resolveRuntimeBuildManifestPath(app);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
applyRuntimeProductIdentity(app, manifest);
