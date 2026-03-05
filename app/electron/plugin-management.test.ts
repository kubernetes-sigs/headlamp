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
 * Tests for the plugin-management module.
 *
 * These tests focus on downloading and installing plugins from local artifacthub pkg files,
 * including testing platform-specific annotations that allow additional binaries to be included.
 */
import crypto from 'crypto';
import fs from 'fs';
import nock from 'nock';
import os from 'os';
import path from 'path';
import * as tar from 'tar';
import { describe, expect, it } from 'vitest';
import { PluginManager } from './plugin-management';
import { getExtraFiles } from './plugin-management';

const TEST_DATA_BASE_DIR = path.join(os.tmpdir(), 'headlamp-test-data');
const PLUGIN_DEST_BASE_DIR = path.join(os.tmpdir(), 'headlamp-test-plugins');
const HEADLAMP_VERSION = '0.30.0';

/**
 * Creates a unique test directory for a test
 * @param basePath Base directory path
 * @param testName Name of the test to create a unique directory for
 * @returns Path to the unique test directory
 */
function getUniqueTestDir(basePath: string, testName: string): string {
  const uniqueName = `${testName}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const dir = path.join(basePath, uniqueName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

describe('PluginManager', () => {
  it('should install plugin with platform-specific binaries', async () => {
    // Create unique directories for this test
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'platform-specific-data');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'platform-specific-plugins');

    // Create test tarballs
    await createMinimalPluginTarball(testDataDir);
    await createPlatformSpecificTarball(testDataDir);

    // Set up mock API responses for this test
    mockArtifactHubAPI(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';
    const progress: any[] = [];

    const progressCallback = (update: any) => {
      progress.push(update);
    };

    await PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, progressCallback, null);

    // Verify the plugin was installed
    const pluginDir = path.join(pluginDestDir, 'headlamp_minikube');
    expect(fs.existsSync(pluginDir)).toBe(true);
    expect(fs.lstatSync(pluginDir).isDirectory()).toBe(true);

    // Verify main.js exists from the main archive
    const mainJsPath = path.join(pluginDir, 'main.js');
    expect(fs.existsSync(mainJsPath)).toBe(true);

    // Verify package.json exists with correct metadata
    const packageJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('headlamp_minikube');
    expect(packageJson.isManagedByHeadlampPlugin).toBe(true);

    // Verify minikube binary exists from platform-specific archive
    const platform = os.platform();
    const arch = os.arch();
    const minikubeBinary = platform === 'win32' ? 'minikube.exe' : 'minikube';
    const minikubePath = path.join(pluginDir, 'bin', minikubeBinary);
    expect(fs.existsSync(minikubePath)).toBe(true);

    // Verify progress includes platform-specific download
    const platformMessages = progress.filter(
      p => p.message && p.message.includes('platform-specific')
    );
    expect(platformMessages.length).toBeGreaterThan(0);
    expect(platformMessages.some(p => p.message.includes(`${platform}/${arch}`))).toBe(true);

    // Clean up this specific test's directories
    if (fs.existsSync(pluginDestDir)) {
      fs.rmSync(pluginDestDir, { recursive: true });
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  }, 30000);

  it('should handle plugin without platform-specific binaries', async () => {
    // Create unique directories for this test
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'no-platform-specific-data');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'no-platform-specific-plugins');

    // Create test tarball (only main plugin tarball needed for this test)
    await createMinimalPluginTarball(testDataDir);

    // Make sure tarball exists before proceeding
    const pluginTarballPath = path.join(testDataDir, 'plugin-tarball.tar.gz');
    if (!fs.existsSync(pluginTarballPath)) {
      throw new Error('Test setup failed: plugin tarball file not created properly');
    }

    // Mock the API to return a response without platform-specific archives
    mockArtifactHubAPIWithoutPlatformSpecific(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';
    const progress: any[] = [];

    const progressCallback = (update: any) => {
      progress.push(update);
    };

    await PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, progressCallback, null);

    // Verify the plugin was installed
    const pluginDir = path.join(pluginDestDir, 'headlamp_minikube');
    expect(fs.existsSync(pluginDir)).toBe(true);
    expect(fs.lstatSync(pluginDir).isDirectory()).toBe(true);

    // Verify main.js exists from the main archive
    const mainJsPath = path.join(pluginDir, 'main.js');
    expect(fs.existsSync(mainJsPath)).toBe(true);

    // Minikube binary should not exist
    const minikubeBinary = os.platform() === 'win32' ? 'minikube.exe' : 'minikube';
    const binPath = path.join(pluginDir, 'bin', minikubeBinary);
    expect(fs.existsSync(binPath)).toBe(false);

    // No platform-specific progress messages
    const platformMessages = progress.filter(
      p => p.message && p.message.includes('0 platform-specific')
    );
    expect(platformMessages.length).toBe(1);

    // Clean up this specific test's directories
    if (fs.existsSync(pluginDestDir)) {
      fs.rmSync(pluginDestDir, { recursive: true });
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  }, 30000);

  it('should uninstall plugin from the same directory where it was installed', async () => {
    // Create unique directories for this test
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'uninstall-test-data');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'uninstall-test-plugins');

    // Create test tarball
    await createMinimalPluginTarball(testDataDir);

    // Mock the API without platform-specific archives
    mockArtifactHubAPIWithoutPlatformSpecific(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';
    const progress: any[] = [];

    const progressCallback = (update: any) => {
      progress.push(update);
    };

    // Install the plugin
    await PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, progressCallback, null);

    // Verify the plugin was installed
    const pluginDir = path.join(pluginDestDir, 'headlamp_minikube');
    expect(fs.existsSync(pluginDir)).toBe(true);

    // Reset progress array for uninstall
    progress.length = 0;

    // Uninstall the plugin from the same directory
    PluginManager.uninstall('headlamp_minikube', pluginDestDir, progressCallback);

    // Verify the plugin was uninstalled
    expect(fs.existsSync(pluginDir)).toBe(false);

    // Verify success message
    const successMessages = progress.filter(p => p.type === 'success');
    expect(successMessages.length).toBe(1);
    expect(successMessages[0].message).toBe('Plugin Uninstalled');

    // Clean up this specific test's directories
    if (fs.existsSync(pluginDestDir)) {
      fs.rmSync(pluginDestDir, { recursive: true });
    }
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  }, 30000);
});

/**
 * Create a minimal plugin tarball for testing
 */
async function createMinimalPluginTarball(testDataDir: string) {
  // Create a temporary directory for the plugin files
  const tempDir = path.join(os.tmpdir(), `headlamp-plugin-test-${Date.now()}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // Create minimal plugin files
  fs.writeFileSync(
    path.join(tempDir, 'main.js'),
    'module.exports = { activate: () => console.log("Plugin activated") };'
  );

  fs.writeFileSync(
    path.join(tempDir, 'package.json'),
    JSON.stringify(
      {
        name: 'headlamp_minikube',
        version: '0.1.0',
        description: 'A UI for managing Minikube',
        main: 'main.js',
      },
      null,
      2
    )
  );

  const tarballPath = path.join(testDataDir, 'plugin-tarball.tar.gz');

  let errToThrow = null;
  try {
    await tar.c({ gzip: true, file: tarballPath, cwd: tempDir }, ['.']);
  } catch (error) {
    console.error('Failed to create test tarball:', error);
    errToThrow = error;
  }

  // Clean up temp dir
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }

  // Throw error if tarball creation failed
  if (errToThrow) {
    throw errToThrow;
  }
}

/**
 * Create a platform-specific tarball containing the minikube binary
 */
async function createPlatformSpecificTarball(testDataDir: string) {
  // Create a temporary directory for the platform-specific files
  const tempDir = path.join(os.tmpdir(), `headlamp-platform-specific-${Date.now()}`);
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  // Create a mock minikube binary
  const platform = os.platform();
  const minikubeBinary = platform === 'win32' ? 'minikube.exe' : 'minikube';
  fs.writeFileSync(path.join(tempDir, minikubeBinary), '#!/bin/sh\necho "Mock minikube binary"');

  if (platform !== 'win32') {
    // Make it executable
    fs.chmodSync(path.join(tempDir, minikubeBinary), 0o755);
  }

  // Create a tarball
  const tarballPath = path.join(testDataDir, 'platform-specific.tar.gz');

  try {
    await tar.c({ gzip: true, file: tarballPath, cwd: tempDir }, ['.']);
  } catch (error) {
    console.error('Failed to create platform-specific tarball:', error);
    throw error;
  }

  // Clean up temp dir
  fs.rmSync(tempDir, { recursive: true });
}

/**
 * Mock the ArtifactHub API responses for testing
 */
function mockArtifactHubAPI(testDataDir: string) {
  try {
    // Calculate checksums for the tarballs
    const pluginTarballPath = path.join(testDataDir, 'plugin-tarball.tar.gz');
    const platformSpecificTarballPath = path.join(testDataDir, 'platform-specific.tar.gz');

    // Verify files exist before calculating checksums
    if (!fs.existsSync(pluginTarballPath)) {
      throw new Error(`Plugin tarball not found at ${pluginTarballPath}`);
    }
    if (!fs.existsSync(platformSpecificTarballPath)) {
      throw new Error(`Platform-specific tarball not found at ${platformSpecificTarballPath}`);
    }

    const pluginChecksum = calculateSHA256(pluginTarballPath);
    const platformSpecificChecksum = calculateSHA256(platformSpecificTarballPath);

    // Create URLs that can be handled by the test environment
    const pluginArchiveURL = getLocalFileURL(pluginTarballPath);
    const platformSpecificArchiveURL = getLocalFileURL(platformSpecificTarballPath);

    // Clean any existing mocks
    nock.cleanAll();

    // Map platform and architecture to the format used in extraFiles
    const platform = os.platform();
    const arch = os.arch();

    // Mock the ArtifactHub API response with the new extra-files format
    nock('https://artifacthub.io')
      .get('/api/v1/packages/headlamp/test-repo/headlamp_minikube')
      .reply(200, {
        name: 'headlamp_minikube',
        display_name: 'Minikube',
        version: '0.1.0',
        repository: {
          name: 'test-repo',
          user_alias: 'tester',
        },
        data: {
          'headlamp/plugin/archive-url': pluginArchiveURL,
          'headlamp/plugin/archive-checksum': `sha256:${pluginChecksum}`,
          'headlamp/plugin/version-compat': '>=0.22',
          'headlamp/plugin/distro-compat': 'in-cluster,web,docker-desktop,desktop',
          'headlamp/plugin/extra-files/0/url': platformSpecificArchiveURL,
          'headlamp/plugin/extra-files/0/checksum': `sha256:${platformSpecificChecksum}`,
          'headlamp/plugin/extra-files/0/arch': `${platform}/${arch}`,
          'headlamp/plugin/extra-files/0/output/minikube/output': 'minikube',
          'headlamp/plugin/extra-files/0/output/minikube/input':
            os.platform() === 'win32' ? 'minikube.exe' : 'minikube',
          // Add dummy entries for other platforms to ensure we only download the correct one
          'headlamp/plugin/extra-files/1/url': 'http://localhost/dummy.tar.gz',
          'headlamp/plugin/extra-files/1/checksum': 'sha256:dummy',
          'headlamp/plugin/extra-files/1/arch': 'other/platform',
          'headlamp/plugin/extra-files/1/output/dummy/output': 'dummy',
          'headlamp/plugin/extra-files/1/output/dummy/input': 'out/dummy',
        },
      });

    // Set up nock to serve the actual tarball files when requested
    nock('http://localhost')
      .get('/' + path.basename(pluginTarballPath))
      .replyWithFile(200, pluginTarballPath, { 'Content-Type': 'application/gzip' })
      .get('/' + path.basename(platformSpecificTarballPath))
      .replyWithFile(200, platformSpecificTarballPath, { 'Content-Type': 'application/gzip' });

    // Allow network connections to localhost
    nock.enableNetConnect('localhost');
  } catch (error) {
    console.error('Error setting up mock API:', error);
    throw error;
  }
}

/**
 * Mock the ArtifactHub API without platform-specific archives
 */
function mockArtifactHubAPIWithoutPlatformSpecific(testDataDir: string) {
  try {
    // Calculate checksums for the tarball
    const pluginTarballPath = path.join(testDataDir, 'plugin-tarball.tar.gz');

    // Verify file exists before calculating checksum
    if (!fs.existsSync(pluginTarballPath)) {
      throw new Error(`Plugin tarball not found at ${pluginTarballPath}`);
    }

    const pluginChecksum = calculateSHA256(pluginTarballPath);

    // Create URL that can be handled by the test environment
    const pluginArchiveURL = getLocalFileURL(pluginTarballPath);

    // Clean any existing mocks
    nock.cleanAll();

    // Mock the ArtifactHub API response without platform-specific data
    nock('https://artifacthub.io')
      .get('/api/v1/packages/headlamp/test-repo/headlamp_minikube')
      .reply(200, {
        name: 'headlamp_minikube',
        display_name: 'Minikube',
        version: '0.1.0',
        repository: {
          name: 'test-repo',
          user_alias: 'tester',
        },
        data: {
          'headlamp/plugin/archive-url': pluginArchiveURL,
          'headlamp/plugin/archive-checksum': `sha256:${pluginChecksum}`,
          'headlamp/plugin/version-compat': '>=0.22',
          'headlamp/plugin/distro-compat': 'in-cluster,web,docker-desktop,desktop',
          // Empty extra-files to indicate no platform-specific files
          'headlamp/plugin/extra-files': [],
        },
      });

    // Set up nock to serve the actual tarball file when requested
    nock('http://localhost')
      .get('/' + path.basename(pluginTarballPath))
      .replyWithFile(200, pluginTarballPath, { 'Content-Type': 'application/gzip' });

    // Allow network connections to localhost
    nock.enableNetConnect('localhost');
  } catch (error) {
    console.error('Error setting up mock API without platform-specific:', error);
    throw error;
  }
}

/**
 * Returns a URL that can be used to reference a local file in tests
 * Uses http://localhost/ instead of file:// protocol to avoid nock issues
 */
function getLocalFileURL(filePath: string): string {
  const filename = path.basename(filePath);
  return `http://localhost/${filename}`;
}

/**
 * Calculate SHA256 hash of a file
 */
function calculateSHA256(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.error(`Error calculating SHA256 for ${filePath}:`, error);
    throw error;
  }
}

describe('getExtraFiles', () => {
  it('should extract extra-files with valid github.com/kubernetes/minikube URL', () => {
    const annotations = {
      'headlamp/plugin/extra-files/0/url':
        'https://github.com/kubernetes/minikube/releases/download/v1.0.0/minikube-linux-amd64.tar.gz',
      'headlamp/plugin/extra-files/0/checksum': 'sha256:abc123',
      'headlamp/plugin/extra-files/0/arch': 'linux/x64',
      'headlamp/plugin/extra-files/0/output/minikube/output': 'minikube',
      'headlamp/plugin/extra-files/0/output/minikube/input': 'minikube-linux-amd64',
    };
    const extraFiles = getExtraFiles(annotations);
    expect(extraFiles).toBeDefined();
    expect(Object.values(extraFiles!)[0].url).toContain('minikube');
  });

  it('should extract extra-files with valid github.com/crc-org/vfkit URL', () => {
    const annotations = {
      'headlamp/plugin/extra-files/0/url':
        'https://github.com/crc-org/vfkit/releases/download/v0.0.1/vfkit',
      'headlamp/plugin/extra-files/0/checksum': 'sha256:def456',
      'headlamp/plugin/extra-files/0/arch': 'linux/x64',
      'headlamp/plugin/extra-files/0/output/vfkit/output': 'vfkit',
      'headlamp/plugin/extra-files/0/output/vfkit/input': 'vfkit-linux-amd64',
    };
    const extraFiles = getExtraFiles(annotations);
    expect(extraFiles).toBeDefined();
    expect(Object.values(extraFiles!)[0].url).toContain('vfkit');
  });

  it('should reject extra-files with invalid URL', () => {
    const annotations = {
      'headlamp/plugin/extra-files/0/url': 'https://malicious.com/bad.tar.gz',
      'headlamp/plugin/extra-files/0/checksum': 'sha256:badbad',
      'headlamp/plugin/extra-files/0/arch': 'linux/x64',
      'headlamp/plugin/extra-files/0/output/bad/output': 'bad',
      'headlamp/plugin/extra-files/0/output/bad/input': 'bad-linux-amd64',
    };
    expect(() => getExtraFiles(annotations)).toThrow();
  });

  it('should allow localhost URLs in test environment', () => {
    process.env.NODE_ENV = 'test';
    const annotations = {
      'headlamp/plugin/extra-files/0/url': 'http://localhost:1234/test.tar.gz',
      'headlamp/plugin/extra-files/0/checksum': 'sha256:dummy',
      'headlamp/plugin/extra-files/0/arch': 'linux/x64',
      'headlamp/plugin/extra-files/0/output/test/output': 'test',
      'headlamp/plugin/extra-files/0/output/test/input': 'test-linux-amd64',
    };
    expect(() => getExtraFiles(annotations)).not.toThrow();
    process.env.NODE_ENV = '';
  });

  it('should return undefined if no extra-files annotation present', () => {
    const annotations = {
      'headlamp/plugin/archive-url':
        'https://github.com/kubernetes/minikube/releases/download/v1.0.0/minikube-linux-amd64.tar.gz',
    };
    expect(getExtraFiles(annotations)).toBeUndefined();
  });
});
