#!/bin/env node

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
const envPaths = require('env-paths');

// Helper function to run CLI commands and return the output
function runCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' });
  } catch (error) {
    console.error(`Error running command "${command}":`, error);
    process.exit(1);
  }
}

// Helper function to get the default plugins directory
function defaultPluginsDir() {
  const paths = envPaths('Headlamp', { suffix: '' });
  const configDir = fs.existsSync(paths.data) ? paths.data : paths.config;
  return path.join(configDir, 'plugins');
}

// create default plugins directory if it doesn't exist
const pluginsDir = defaultPluginsDir();
if (!fs.existsSync(pluginsDir)) {
  fs.mkdirSync(pluginsDir, { recursive: true });
}

// List plugins initially
let output = runCommand('node ../bin/headlamp-plugin.js list --json');
console.log('Initial list output:', output);
let plugins = JSON.parse(output);
console.log('Initial plugins:', plugins);

// Ensure the plugin is not installed
const pluginName = 'prometheus';
let pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
assert.strictEqual(pluginExists, false, 'Plugin should not be initially installed');

// Install the plugin
const pluginURL = 'https://artifacthub.io/packages/headlamp/test-123/prometheus_headlamp_plugin';
output = runCommand(`node ../bin/headlamp-plugin.js install ${pluginURL}`);
console.log('Install output:', output);

// List plugins to verify installation
output = runCommand('node ../bin/headlamp-plugin.js list --json');
plugins = JSON.parse(output);
console.log('Plugins after install:', plugins);
pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
assert.strictEqual(pluginExists, true, 'Plugin should be installed');

// Update the plugin
output = runCommand(`node ../bin/headlamp-plugin.js update ${pluginName}`);
console.log('Update output:', output);

// List plugins to verify update
output = runCommand('node ../bin/headlamp-plugin.js list --json');
plugins = JSON.parse(output);
console.log('Plugins after update:', plugins);
pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
assert.strictEqual(pluginExists, true, 'Plugin should still be installed after update');

// Uninstall the plugin
output = runCommand(`node ../bin/headlamp-plugin.js uninstall ${pluginName}`);
console.log('Uninstall output:', output);

// List plugins to verify uninstallation
output = runCommand('node ../bin/headlamp-plugin.js list --json');
console.log('Initial list output:', output);
plugins = JSON.parse(output);
console.log('Plugins after uninstall:', plugins);
pluginExists = plugins.some(plugin => plugin.pluginName === pluginName);
assert.strictEqual(pluginExists, false, 'Plugin should be uninstalled');

console.log('All tests passed successfully.');
