#!/usr/bin/env node

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
 * This script copies example plugins from plugins/examples into
 * examples/ directory for bundling with headlamp-plugin package.
 * These plugins are referenced in AGENTS.md and help agents write good plugins.
 */

const fs = require('fs-extra');
const path = require('path');
const { getLocalGitHash, storeHash, shouldSkipBasedOnHash } = require('./git-hash-utils');

const scriptDir = __dirname;
const pluginDir = path.resolve(scriptDir, '..');
const examplesSourceDir = path.resolve(pluginDir, '..', 'examples');
const examplesDestDir = path.resolve(pluginDir, 'examples');
const hashFile = path.resolve(examplesDestDir, '.git-hash');

console.log('Bundling example plugins...');
console.log(`Source: ${examplesSourceDir}`);
console.log(`Destination: ${examplesDestDir}`);

// Get the current git hash
const currentHash = getLocalGitHash('plugins/examples', path.resolve(pluginDir, '..', '..'));

// Check if we can skip bundling
if (shouldSkipBasedOnHash(examplesDestDir, hashFile, currentHash)) {
  console.log('Example plugins are already up to date (git hash matches)');
  console.log('Skipping bundle...');
  process.exit(0);
}

// Remove existing examples directory if it exists
if (fs.existsSync(examplesDestDir)) {
  console.log('Removing existing examples directory...');
  fs.rmSync(examplesDestDir, { recursive: true });
}

// Create examples directory
fs.mkdirSync(examplesDestDir, { recursive: true });

// Get list of example plugins
const examplePlugins = fs
  .readdirSync(examplesSourceDir, { withFileTypes: true })
  .filter(dirent => dirent.isDirectory())
  .map(dirent => dirent.name);

console.log(`Found ${examplePlugins.length} example plugins to bundle`);

// Copy each example plugin
examplePlugins.forEach(pluginName => {
  const sourcePath = path.join(examplesSourceDir, pluginName);
  const destPath = path.join(examplesDestDir, pluginName);

  console.log(`Copying ${pluginName}...`);

  // Copy the plugin directory
  fs.copySync(sourcePath, destPath, {
    filter: src => {
      // Skip node_modules, dist, and other build artifacts
      const relativePath = path.relative(sourcePath, src);
      if (relativePath.includes('node_modules')) return false;
      if (relativePath.includes('dist')) return false;
      if (relativePath.includes('.eslintcache')) return false;
      if (relativePath.includes('storybook-static')) return false;
      if (relativePath.includes('package-lock.json')) return false;
      return true;
    },
  });
});

// Store the git hash if available
if (currentHash) {
  storeHash(hashFile, currentHash);
  console.log(`Successfully bundled ${examplePlugins.length} example plugins to examples/`);
  console.log(`Git hash: ${currentHash}`);
} else {
  console.log(`Successfully bundled ${examplePlugins.length} example plugins to examples/`);
}
