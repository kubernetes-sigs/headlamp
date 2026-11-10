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

const { execSync } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper function to run CLI commands and return the output
function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' });
  } catch (error) {
    console.error(`Error running command "${command}":`, error);
    throw error;
  }
}

// Create temporary directory for tests
const tempPluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugins-test-'));

try {
  const pluginctlBin = path.join(__dirname, '../bin/pluginctl.js');
  const baseCmd = `node "${pluginctlBin}"`;
  const folderOpt = `--folderName "${tempPluginsDir}"`;

  // List plugins initially
  let output = runCommand(`${baseCmd} list --json ${folderOpt}`);
  console.log('Initial list output:', output);
  let plugins = JSON.parse(output);
  console.log('Initial plugins:', plugins);

  // Ensure the plugin is not installed
  const pluginName = '@headlamp-k8s/flux';
  let pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
  assert.strictEqual(pluginExists, false, 'Plugin should not be initially installed');

  // Install the plugin
  const pluginURL = 'https://artifacthub.io/packages/headlamp/headlamp-plugins/headlamp_flux';
  output = runCommand(`${baseCmd} install ${pluginURL} ${folderOpt}`);
  console.log('Install output:', output);

  // List plugins to verify installation
  output = runCommand(`${baseCmd} list --json ${folderOpt}`);
  plugins = JSON.parse(output);
  console.log('Plugins after install:', plugins);
  pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
  assert.strictEqual(pluginExists, true, 'Plugin should be installed');

  // Update the plugin (folder is a positional arg for this command)
  output = runCommand(`${baseCmd} update "${pluginName}" "${tempPluginsDir}"`);
  console.log('Update output:', output);

  // List plugins to verify update
  output = runCommand(`${baseCmd} list --json ${folderOpt}`);
  plugins = JSON.parse(output);
  console.log('Plugins after update:', plugins);
  pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
  assert.strictEqual(pluginExists, true, 'Plugin should still be installed after update');

  // Uninstall the plugin
  output = runCommand(`${baseCmd} uninstall "${pluginName}" ${folderOpt}`);
  console.log('Uninstall output:', output);

  // List plugins to verify uninstallation
  output = runCommand(`${baseCmd} list --json ${folderOpt}`);
  console.log('Initial list output:', output);
  plugins = JSON.parse(output);
  console.log('Plugins after uninstall:', plugins);
  pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
  assert.strictEqual(pluginExists, false, 'Plugin should be uninstalled');

  console.log('All tests passed successfully.');
} catch (error) {
  console.error('Test failed with error:', error);
  throw error;
} finally {
  // Clean up the temp dir
  fs.rmSync(tempPluginsDir, { recursive: true, force: true });
}
