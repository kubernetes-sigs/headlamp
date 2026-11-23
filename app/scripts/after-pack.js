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

'use strict';

const fs = require('node:fs');
const path = require('node:path');

exports.default = async context => {
  const startedAt = Date.now();
  console.log(`[build-timing] Electron afterPack started at ${new Date(startedAt).toISOString()}`);
  const { loadBuildManifest, verifyPackagedResources } = await import(
    '../build/build-manifest.mjs'
  );
  const resourcesDirectory = context.packager?.getResourcesDir
    ? context.packager.getResourcesDir(context.appOutDir)
    : path.join(context.appOutDir, 'resources');

  if (fs.existsSync('.env')) {
    console.info('Copying .env file to app resources directory!');
    try {
      fs.copyFileSync('.env', path.join(resourcesDirectory, '.env'));
    } catch (err) {
      console.error('Failed to copy .env after pack:', err);
    }
  }

  verifyPackagedResources(resourcesDirectory, loadBuildManifest(), context.electronPlatformName);
  console.log(
    `[build-timing] Electron afterPack completed in ${((Date.now() - startedAt) / 1000).toFixed(
      3
    )}s`
  );
};
