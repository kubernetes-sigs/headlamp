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
 * This script fetches official plugins from https://github.com/headlamp-k8s/plugins/
 * and bundles them into official-plugins/ directory for inclusion with headlamp-plugin package.
 * These plugins are referenced in AGENTS.md and help agents write good plugins.
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { getRemoteGitHash, storeHash, shouldSkipBasedOnHash } = require('./git-hash-utils');

const scriptDir = __dirname;
const pluginDir = path.resolve(scriptDir, '..');
const officialPluginsDir = path.resolve(pluginDir, 'official-plugins');
const hashFile = path.resolve(officialPluginsDir, '.git-hash');
const officialPluginsRepo = 'https://github.com/headlamp-k8s/plugins.git';

console.log('Fetching official plugins...');

// Get the current remote hash
const remoteHash = getRemoteGitHash(officialPluginsRepo);

// Check if we can skip fetching
if (shouldSkipBasedOnHash(officialPluginsDir, hashFile, remoteHash)) {
  console.log('Official plugins are already up to date (git hash matches)');
  console.log('Skipping fetch...');
  process.exit(0);
}

console.log('Fetching latest official plugins from GitHub...');

// Remove existing directory if it exists
if (fs.existsSync(officialPluginsDir)) {
  console.log('Removing existing official-plugins directory...');
  fs.rmSync(officialPluginsDir, { recursive: true });
}

// Create official-plugins directory
fs.mkdirSync(officialPluginsDir, { recursive: true });

// Clone the repository into a temporary directory
const tempDir = path.resolve(pluginDir, '.temp-official-plugins');
if (fs.existsSync(tempDir)) {
  fs.rmSync(tempDir, { recursive: true });
}

try {
  console.log('Cloning official plugins repository...');
  execSync(`git clone --depth 1 ${officialPluginsRepo} ${tempDir}`, {
    stdio: 'inherit',
  });

  // Get the current commit hash
  const currentHash = execSync('git rev-parse HEAD', {
    cwd: tempDir,
    encoding: 'utf8',
  }).trim();

  // Get list of plugin directories (skip .git and README.md)
  const pluginDirs = fs
    .readdirSync(tempDir, { withFileTypes: true })
    .filter(
      dirent =>
        dirent.isDirectory() && dirent.name !== '.git' && !dirent.name.startsWith('.')
    )
    .map(dirent => dirent.name);

  console.log(`Found ${pluginDirs.length} official plugins`);

  // Copy each plugin directory
  pluginDirs.forEach(pluginName => {
    const sourcePath = path.join(tempDir, pluginName);
    const destPath = path.join(officialPluginsDir, pluginName);

    console.log(`Copying ${pluginName}...`);

    // Copy the plugin directory
    fs.copySync(sourcePath, destPath, {
      filter: src => {
        // Skip node_modules, dist, and other build artifacts
        const relativePath = path.relative(sourcePath, src);
        if (relativePath.includes('node_modules')) return false;
        if (relativePath.includes('dist')) return false;
        if (relativePath.includes('.git')) return false;
        if (relativePath.includes('.eslintcache')) return false;
        if (relativePath.includes('storybook-static')) return false;
        if (relativePath.includes('package-lock.json')) return false;
        return true;
      },
    });
  });

  // Store the git hash
  storeHash(hashFile, currentHash);

  console.log(
    `Successfully fetched ${pluginDirs.length} official plugins to official-plugins/`
  );
  console.log(`Git hash: ${currentHash}`);
} catch (error) {
  console.error('Failed to fetch official plugins:', error.message);
  process.exit(1);
} finally {
  // Clean up temporary directory
  if (fs.existsSync(tempDir)) {
    console.log('Cleaning up temporary directory...');
    fs.rmSync(tempDir, { recursive: true });
  }
}
