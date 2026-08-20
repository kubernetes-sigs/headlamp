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
 * Electron Builder configuration for Headlamp desktop packages.
 *
 * Most settings remain in `package.json`. This wrapper only replaces the
 * default build-manifest resource when `HEADLAMP_BUILD_MANIFEST` selects a
 * product-specific manifest. Electron Builder must still copy that selected
 * file as `app-build-manifest.json`, because the packaged app reads that fixed
 * runtime filename from its resources directory.
 */
import type { Configuration } from 'electron-builder';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPlatformMetadata,
  applyProductMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} from './scripts/build-manifest.ts';

type ExtraResource =
  | string
  | {
      from: string;
      to?: string;
      [key: string]: unknown;
    };

type ElectronBuilderConfiguration = {
  extraResources: ExtraResource[];
  [key: string]: unknown;
};

const require = createRequire(import.meta.url);
const packageJson = require('./package.json');
const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const manifestFile = resolveBuildManifestPath();
const manifest = loadBuildManifest(manifestFile);
const defaultManifest = path.resolve(DEFAULT_MANIFEST_FILE);
const packageBuild = packageJson.build as ElectronBuilderConfiguration;

const config: Configuration = applyPlatformMetadata(
  applyProductMetadata(
    {
      ...packageBuild,
      extraResources: packageBuild.extraResources.map(resource => {
        // Preserve every resource except the default manifest entry.
        if (
          typeof resource === 'string' ||
          path.resolve(configDirectory, resource.from) !== defaultManifest
        ) {
          return resource;
        }
        return { ...resource, from: manifestFile, to: 'app-build-manifest.json' };
      }),
    },
    manifest
  ),
  manifest
);

export default config;
