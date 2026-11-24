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

const { execFileSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper function to run CLI commands and return the output
function runCommand(args) {
  try {
    return execFileSync(
      process.execPath,
      [path.join(__dirname, '../bin/pluginctl.js'), ...args],
      {
        encoding: 'utf8',
        timeout: 30000,
      }
    );
  } catch (error) {
    console.error('Error running pluginctl:', args, error);
    throw error;
  }
}

// Create temporary directory for tests
const tempPluginsDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'headlamp-plugins-test-')
);

try {
  const folderOpt = ['--folderName', tempPluginsDir];

  // List plugins initially
  let output = runCommand(['list', '--json', ...folderOpt]);
  console.log('Initial list output:', output);
  let plugins = JSON.parse(output);
  console.log('Initial plugins:', plugins);

  // Ensure the plugin is not installed
  const pluginName = '@headlamp-k8s/flux';
  let pluginExists = plugins.some((plugin) => plugin.pluginName === pluginName);
  assert.strictEqual(
    pluginExists,
    false,
    'Plugin should not be initially installed'
  );

  // Install the plugin
  const pluginURL =
    'https://artifacthub.io/packages/headlamp/headlamp-plugins/headlamp_flux';
  output = runCommand(['install', pluginURL, ...folderOpt]);
  console.log('Install output:', output);

  // List plugins to verify installation
  output = runCommand(['list', '--json', ...folderOpt]);
  plugins = JSON.parse(output);
  console.log('Plugins after install:', plugins);
  pluginExists = plugins.some((plugin) => plugin.pluginName === pluginName);
  assert.strictEqual(pluginExists, true, 'Plugin should be installed');

  // Force a real update instead of accepting an already-current installation.
  const packageFile = path.join(
    tempPluginsDir,
    'headlamp_flux',
    'package.json'
  );
  const installed = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const currentVersion = installed.artifacthub.version;
  installed.artifacthub.version = '0.0.0';
  fs.writeFileSync(packageFile, JSON.stringify(installed));
  output = runCommand(['update', pluginName, tempPluginsDir]);
  console.log('Update output:', output);
  assert.notStrictEqual(
    JSON.parse(fs.readFileSync(packageFile, 'utf8')).artifacthub.version,
    '0.0.0',
    `Expected an update from fixture version to ${currentVersion} or newer`
  );

  // List plugins to verify update
  output = runCommand(['list', '--json', ...folderOpt]);
  plugins = JSON.parse(output);
  console.log('Plugins after update:', plugins);
  pluginExists = plugins.some((plugin) => plugin.pluginName === pluginName);
  assert.strictEqual(
    pluginExists,
    true,
    'Plugin should still be installed after update'
  );

  // Uninstall the plugin
  output = runCommand(['uninstall', pluginName, ...folderOpt]);
  console.log('Uninstall output:', output);

  // List plugins to verify uninstallation
  output = runCommand(['list', '--json', ...folderOpt]);
  console.log('Initial list output:', output);
  plugins = JSON.parse(output);
  console.log('Plugins after uninstall:', plugins);
  pluginExists = plugins.some((plugin) => plugin.pluginName === pluginName);
  assert.strictEqual(pluginExists, false, 'Plugin should be uninstalled');

  console.log('All tests passed successfully.');
} catch (error) {
  console.error('Test failed with error:', error);
  throw error;
} finally {
  // Clean up the temp dir
  fs.rmSync(tempPluginsDir, { recursive: true, force: true });
}
