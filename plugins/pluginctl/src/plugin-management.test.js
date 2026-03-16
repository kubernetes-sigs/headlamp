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

const pluginManagement = require('./plugin-management.js');
const tmp = require('tmp');
const fs = require('fs');
const semver = require('semver');

const PluginManager = pluginManagement.PluginManager;
const validateArchiveURL = pluginManagement.validateArchiveURL;


// Mocking progressCallback function for testing
// eslint-disable-next-line
const mockProgressCallback = jest.fn(args => {
  // console.log("Progress Callback:", args);  // Uncomment for debugging
});

describe('PluginManager Test Cases', () => {
  let tempDir;

  beforeAll(() => {
    // Create a temporary directory before all tests
    tempDir = tmp.dirSync({ unsafeCleanup: true }).name;
  });

  afterAll(() => {
    // Remove the temporary directory after all tests
    fs.rmdirSync(tempDir, { recursive: true });
  });

  beforeEach(() => {
    // Initialize a new PluginManager instance before each test
    jest.clearAllMocks();
  });

  test('Install Plugin', async () => {
    await PluginManager.install(
      'https://artifacthub.io/packages/headlamp/test-123/appcatalog_headlamp_plugin',
      tempDir,
      '',
      mockProgressCallback
    );
    expect(mockProgressCallback).toHaveBeenCalledWith({
      type: 'success',
      message: 'Plugin Installed',
    });
  });

  test('List Plugins', () => {
    PluginManager.list(tempDir, mockProgressCallback);
    // Assuming "app-catalog" plugin is in the list of plugins
    expect(mockProgressCallback).toHaveBeenCalledWith({
      type: 'success',
      message: 'Plugins Listed',
      data: expect.any(Array),
    });
  });

  test('No Update available for Plugin', async () => {
    // No updates available for "app-catalog" plugin
    await PluginManager.update('app-catalog', tempDir, '', mockProgressCallback);
    expect(mockProgressCallback).toHaveBeenCalledWith({
      type: 'error',
      message: 'No updates available',
    });
  });

  test('Update Plugin', async () => {
    // update the "app-catalog" plugin package.json with lower state
    const packageJSONPath = `${tempDir}/appcatalog_headlamp_plugin/package.json`;
    const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath));
    packageJSON.artifacthub.version = `${semver.major(
      packageJSON.artifacthub.version
    )}.${semver.minor(packageJSON.artifacthub.version)}.${
      semver.patch(packageJSON.artifacthub.version) - 1
    }`; // Reduce the version using semver
    // Write the updated package.json back to the file
    fs.writeFileSync(packageJSONPath, JSON.stringify(packageJSON, null, 2));

    await PluginManager.update('app-catalog', tempDir, '', mockProgressCallback);
    expect(mockProgressCallback).toHaveBeenCalledWith({
      type: 'success',
      message: 'Plugin Updated',
    });
  });

  test('Uninstall Plugin', async () => {
    const tempDir = tmp.dirSync({ unsafeCleanup: true }).name;

    await PluginManager.install(
      'https://artifacthub.io/packages/headlamp/test-123/appcatalog_headlamp_plugin',
      tempDir,
      '',
      mockProgressCallback
    );
    expect(mockProgressCallback).toHaveBeenCalledWith({
      type: 'success',
      message: 'Plugin Installed',
    });

    PluginManager.uninstall('app-catalog', tempDir, mockProgressCallback);
    expect(mockProgressCallback).toHaveBeenCalledWith({
      type: 'success',
      message: 'Plugin Uninstalled',
    });

    fs.rmdirSync(tempDir, { recursive: true });
  });
});

describe('validateArchiveURL', () => {
  test('valid GitHub release URL', () => {
    expect(validateArchiveURL('https://github.com/kubernetes-sigs/headlamp/releases/download/v0.24.1/Headlamp-0.24.1-win-x64.exe')).toBe(true);
  });

  test('valid GitHub archive URL', () => {
    expect(validateArchiveURL('https://github.com/owner/repo/archive/refs/tags/v1.0.0.zip')).toBe(true);
  });

  test('valid Bitbucket download URL', () => {
    expect(validateArchiveURL('https://bitbucket.org/owner/repo/downloads/package-1.0.0.zip')).toBe(true);
  });

  test('valid Bitbucket get archive URL', () => {
    expect(validateArchiveURL('https://bitbucket.org/owner/repo/get/v1.0.0.tar.gz')).toBe(true);
  });

  test('valid GitLab release URL', () => {
    expect(validateArchiveURL('https://gitlab.com/gitlab-org/gitlab/-/archive/v17.2.0-ee/gitlab-v17.2.0-ee.tar.gz')).toBe(true);
  });

  test('invalid URL', () => {
    expect(validateArchiveURL('https://example.com/some/invalid/url')).toBe(false);
  });

  test('invalid GitHub URL', () => {
    expect(validateArchiveURL('https://github.com/owner/repo/invalid/path')).toBe(false);
  });

  test('invalid Bitbucket URL', () => {
    expect(validateArchiveURL('https://bitbucket.org/owner/repo/invalid/path')).toBe(false);
  });

  test('invalid GitLab URL', () => {
    expect(validateArchiveURL('https://gitlab.com/owner/repo/invalid/path')).toBe(false);
  });
});
