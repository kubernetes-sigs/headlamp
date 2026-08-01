/*
 * Copyright 2026 The Kubernetes Authors
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

const DEFAULT_MANIFEST_FILE = path.resolve(__dirname, '../app-build-manifest.json');

function resolveBuildManifestPath(env = process.env, cwd = process.cwd()) {
  const configuredPath = env.HEADLAMP_BUILD_MANIFEST;
  return configuredPath ? path.resolve(cwd, configuredPath) : DEFAULT_MANIFEST_FILE;
}

function loadBuildManifest(manifestFile = resolveBuildManifestPath()) {
  return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
}

function applyPlatformMetadata(config, manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Build manifest must be an object');
  }

  const platforms = manifest.platforms;
  if (platforms === undefined) {
    return config;
  }
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) {
    throw new Error('Build manifest platforms must be an object');
  }

  const allowedFields = new Set([
    'appId',
    'bundleShortVersion',
    'bundleVersion',
    'executableName',
    'icon',
    'artifactName',
  ]);
  const result = { ...config };
  for (const platform of ['linux', 'mac', 'win']) {
    const metadata = platforms[platform];
    if (metadata === undefined) {
      continue;
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new Error(`Build manifest platforms.${platform} must be an object`);
    }
    for (const [field, value] of Object.entries(metadata)) {
      if (!allowedFields.has(field)) {
        throw new Error(`Unsupported build manifest platforms.${platform}.${field}`);
      }
      if (typeof value !== 'string') {
        throw new Error(`Build manifest platforms.${platform}.${field} must be a string`);
      }
    }
    result[platform] = { ...config[platform], ...metadata };
  }
  return result;
}

module.exports = {
  applyPlatformMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
};
