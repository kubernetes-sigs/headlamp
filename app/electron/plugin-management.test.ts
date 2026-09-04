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
import { afterEach, describe, expect, it, vi } from 'vitest';
import envPaths from './env-paths';
import {
  defaultKubeConfigsDir,
  defaultPluginsDir,
  defaultUserPluginsDir,
  getExtraFiles,
  PluginManager,
  preparePluginExecutable,
  preparePluginScript,
  recordPluginExecutableIntegrity,
  recordPluginInstallationIntegrity,
  removePreparedPluginExecutable,
  removePreparedPluginScript,
  setAppConfigDirName,
  verifyPluginExecutableIntegrity,
  verifyPluginInstallationIntegrity,
} from './plugin-management';

const TEST_DATA_BASE_DIR = path.join(os.tmpdir(), 'headlamp-test-data');
const PLUGIN_DEST_BASE_DIR = path.join(os.tmpdir(), 'headlamp-test-plugins');
const HEADLAMP_VERSION = '0.30.0';
const ORIGINAL_PLATFORM = process.platform;

describe('plugin installation integrity', () => {
  const temporaryDirectories: string[] = [];
  const identity = {
    repository: 'headlamp-plugins',
    package: 'headlamp_minikube',
    packageId: 'fbc182b5-eb90-42b7-ace8-62a7576abafd',
    repositoryId: '767e1f40-ee09-401b-b8d4-930740da5a8a',
  };

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-installation-receipt-'));
    temporaryDirectories.push(root);
    const bundle = path.join(root, 'plugin');
    const receiptFile = path.join(root, 'app-state', 'plugin-installation-receipts.json');
    const script = path.join(bundle, 'manage.js');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'package.json'), '{"name":"@headlamp-k8s/minikube"}');
    fs.writeFileSync(script, 'trusted');
    return { root, bundle, receiptFile, script };
  }

  it('records installed files with the expected Artifact Hub identity', async () => {
    const { bundle, receiptFile } = fixture();
    await recordPluginInstallationIntegrity(bundle, identity, receiptFile);

    await expect(verifyPluginInstallationIntegrity(bundle, identity, receiptFile)).resolves.toBe(
      true
    );
    await expect(
      verifyPluginInstallationIntegrity(
        bundle,
        {
          repository: identity.repository,
          package: identity.package,
        },
        receiptFile
      )
    ).resolves.toBe(true);
    await expect(
      verifyPluginInstallationIntegrity(
        bundle,
        {
          repository: identity.repository,
          package: 'another-package',
        },
        receiptFile
      )
    ).resolves.toBe(false);
    await expect(
      verifyPluginInstallationIntegrity(
        bundle,
        {
          ...identity,
          repositoryId: '61e223f8-49fe-47c5-9bf8-802e8f759cab',
        },
        receiptFile
      )
    ).resolves.toBe(false);
    expect(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).receipts[0]).toEqual(
      expect.objectContaining({
        ...identity,
        inventoryPath: fs.realpathSync(path.dirname(bundle)),
        bundleName: path.basename(bundle),
      })
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8')).headlampPluginIntegrity
    ).toBeUndefined();
  });

  it('rejects modified files and receipt-less legacy installations', async () => {
    const { bundle, receiptFile, script } = fixture();

    await expect(verifyPluginInstallationIntegrity(bundle, identity, receiptFile)).resolves.toBe(
      false
    );
    await recordPluginInstallationIntegrity(bundle, identity, receiptFile);
    fs.writeFileSync(script, 'replaced');
    await expect(verifyPluginInstallationIntegrity(bundle, identity, receiptFile)).resolves.toBe(
      false
    );
  });

  it('rejects a forged package-local receipt and a copied bundle', async () => {
    const { root, bundle, receiptFile } = fixture();
    const packagePath = path.join(bundle, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    packageJson.headlampPluginIntegrity = { version: 1, installation: { ...identity, files: {} } };
    fs.writeFileSync(packagePath, JSON.stringify(packageJson));

    await expect(verifyPluginInstallationIntegrity(bundle, identity, receiptFile)).resolves.toBe(
      false
    );
    await recordPluginInstallationIntegrity(bundle, identity, receiptFile);
    const copiedBundle = path.join(root, 'other-inventory', 'plugin');
    fs.cpSync(bundle, copiedBundle, { recursive: true });

    await expect(
      verifyPluginInstallationIntegrity(copiedBundle, identity, receiptFile)
    ).resolves.toBe(false);
  });

  it('records a root file named __proto__ in the integrity map', async () => {
    const { bundle, receiptFile } = fixture();
    const specialFile = path.join(bundle, '__proto__');
    fs.writeFileSync(specialFile, 'trusted');
    await recordPluginInstallationIntegrity(bundle, identity, receiptFile);
    fs.writeFileSync(specialFile, 'replaced');

    await expect(verifyPluginInstallationIntegrity(bundle, identity, receiptFile)).resolves.toBe(
      false
    );
  });

  it('prepares immutable script bytes and removes them after use', async () => {
    const { root, bundle, receiptFile, script } = fixture();
    const preparedRoot = path.join(root, 'prepared');
    await recordPluginInstallationIntegrity(bundle, identity, receiptFile);

    const prepared = await preparePluginScript(
      bundle,
      'manage.js',
      identity,
      preparedRoot,
      receiptFile
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    fs.writeFileSync(script, 'replaced');
    expect(fs.readFileSync(prepared.scriptPath, 'utf8')).toBe('trusted');
    removePreparedPluginScript(prepared.scriptPath, preparedRoot);
    expect(fs.existsSync(prepared.scriptPath)).toBe(false);
  });
});

describe('plugin executable integrity', () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM });
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-executable-receipt-'));
    temporaryDirectories.push(root);
    const bundle = path.join(root, 'plugin');
    const executable = path.join(bundle, 'bin', 'examplectl');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(path.join(bundle, 'package.json'), '{"name":"@example/plugin"}');
    fs.writeFileSync(executable, 'trusted');
    return { bundle, executable };
  }

  it('accepts installed bytes and rejects replacements', async () => {
    const { bundle, executable } = fixture();
    await recordPluginExecutableIntegrity(bundle, ['bin/examplectl']);

    await expect(
      verifyPluginExecutableIntegrity(bundle, 'bin/examplectl', executable)
    ).resolves.toEqual({ ok: true });
    fs.writeFileSync(executable, 'replaced');
    await expect(
      verifyPluginExecutableIntegrity(bundle, 'bin/examplectl', executable)
    ).resolves.toEqual({ ok: false, reason: 'digest-mismatch' });
  });

  it('prepares immutable app-owned executable bytes', async () => {
    const { bundle, executable } = fixture();
    const preparedRoot = path.join(path.dirname(bundle), 'prepared');
    await recordPluginExecutableIntegrity(bundle, ['bin/examplectl']);

    const prepared = await preparePluginExecutable(
      bundle,
      'bin/examplectl',
      executable,
      preparedRoot
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    fs.writeFileSync(executable, 'replaced');
    expect(fs.readFileSync(prepared.executablePath, 'utf8')).toBe('trusted');
    removePreparedPluginExecutable(prepared.executablePath, preparedRoot);
    expect(fs.existsSync(prepared.executablePath)).toBe(false);
  });

  it('does not prepare modified or outside executable bytes', async () => {
    const { bundle, executable } = fixture();
    const preparedRoot = path.join(path.dirname(bundle), 'prepared');
    await recordPluginExecutableIntegrity(bundle, ['bin/examplectl']);
    fs.writeFileSync(executable, 'replaced');
    await expect(
      preparePluginExecutable(bundle, 'bin/examplectl', executable, preparedRoot)
    ).resolves.toEqual({ ok: false, reason: 'digest-mismatch' });

    const outsideExecutable = path.join(path.dirname(bundle), 'outside');
    fs.writeFileSync(outsideExecutable, 'trusted');
    await expect(
      preparePluginExecutable(bundle, 'bin/examplectl', outsideExecutable, preparedRoot)
    ).resolves.toEqual({ ok: false, reason: 'unavailable-executable' });
  });

  it('uses logical executable paths for Windows .exe files', async () => {
    const { bundle, executable } = fixture();
    fs.renameSync(executable, `${executable}.exe`);
    Object.defineProperty(process, 'platform', { value: 'win32' });

    await recordPluginExecutableIntegrity(bundle, ['bin/examplectl']);
    await expect(
      verifyPluginExecutableIntegrity(bundle, 'bin/examplectl', `${executable}.exe`)
    ).resolves.toEqual({ ok: true });
  });
});

describe('default plugin directories', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM });
    setAppConfigDirName('Headlamp');
    vi.restoreAllMocks();
  });

  it.each([
    ['plugins', defaultPluginsDir],
    ['user-plugins', defaultUserPluginsDir],
  ])('uses the branded data directory for %s when it exists', (subdirectory, getDirectory) => {
    const appName = 'Example Desktop';
    const paths = envPaths(appName, { suffix: '' });
    setAppConfigDirName(appName);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    expect(getDirectory()).toBe(path.join(paths.data, subdirectory));
  });

  it.each([
    ['plugins', defaultPluginsDir],
    ['user-plugins', defaultUserPluginsDir],
  ])('uses the branded config directory for %s otherwise', (subdirectory, getDirectory) => {
    const appName = 'Example Desktop';
    const paths = envPaths(appName, { suffix: '' });
    setAppConfigDirName(appName);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(getDirectory()).toBe(path.join(paths.config, subdirectory));
  });

  it.each([
    ['darwin', 'data'],
    ['linux', 'config'],
    ['win32', 'config'],
  ] as const)(
    'uses the backend-compatible kubeconfig directory on %s',
    (platform, baseDirectory) => {
      const appName = 'Example Desktop';
      Object.defineProperty(process, 'platform', { value: platform });
      const paths = envPaths(appName, { suffix: '' });
      const existsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      setAppConfigDirName(appName);

      expect(defaultKubeConfigsDir()).toBe(path.join(paths[baseDirectory], 'kubeconfigs'));
      expect(existsSync).not.toHaveBeenCalled();
    }
  );
});

describe('plugin management loading', () => {
  it('defers installation-only dependencies', async () => {
    const tarFactory = vi.fn(() => ({}));
    const semverFactory = vi.fn(() => ({}));

    vi.resetModules();
    vi.doMock('tar', tarFactory);
    vi.doMock('semver', semverFactory);

    try {
      await import('./plugin-management');

      expect(tarFactory).not.toHaveBeenCalled();
      expect(semverFactory).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('tar');
      vi.doUnmock('semver');
    }
  });
});

describe('Artifact Hub package identity', () => {
  it('preserves immutable package and repository IDs from the API', async () => {
    nock('https://artifacthub.io')
      .get('/api/v1/packages/headlamp/example-repo/example-plugin')
      .reply(200, {
        package_id: 'package-id',
        name: 'example-plugin',
        display_name: 'Example plugin',
        version: '1.0.0',
        repository: {
          repository_id: 'repository-id',
          name: 'example-repo',
          user_alias: 'publisher',
        },
        data: {
          'headlamp/plugin/archive-url': 'https://github.com/example/plugin/archive.tar.gz',
          'headlamp/plugin/archive-checksum': `sha256:${'0'.repeat(64)}`,
          'headlamp/plugin/version-compat': '>=0.22',
          'headlamp/plugin/distro-compat': 'desktop',
        },
      });

    const plugin = await PluginManager.fetchPluginInfo(
      'https://artifacthub.io/packages/headlamp/example-repo/example-plugin'
    );

    expect(plugin.packageId).toBe('package-id');
    expect(plugin.repository.repositoryId).toBe('repository-id');
  });
});

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
    await expect(
      verifyPluginExecutableIntegrity(pluginDir, 'bin/minikube', minikubePath)
    ).resolves.toEqual({ ok: true });

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

  it('keeps an updated plugin when its unique backup cannot be removed', async () => {
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'update-backup-data');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'update-backup-plugins');
    await createMinimalPluginTarball(testDataDir);
    await createPlatformSpecificTarball(testDataDir);
    mockArtifactHubAPI(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';
    await PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, null, null);

    mockArtifactHubAPI(testDataDir, '0.2.0');
    const remove = fs.rmSync.bind(fs);
    const removeSpy = vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (String(target).includes('.update-backup-')) {
        throw new Error('backup is busy');
      }
      return remove(target, options);
    });
    const renameSpy = vi.spyOn(fs, 'renameSync');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      PluginManager.update('headlamp_minikube', pluginDestDir, HEADLAMP_VERSION, null, null)
    ).resolves.toBeUndefined();

    const pluginDir = path.join(pluginDestDir, 'headlamp_minikube');
    const packageJson = JSON.parse(fs.readFileSync(path.join(pluginDir, 'package.json'), 'utf8'));
    const executable = path.join(
      pluginDir,
      'bin',
      process.platform === 'win32' ? 'minikube.exe' : 'minikube'
    );
    const backupPath = renameSpy.mock.calls
      .map(([, destination]) => String(destination))
      .find(destination => destination.includes('.update-backup-'));
    expect(backupPath).toMatch(/\.update-backup-[a-f0-9]{16}$/);
    expect(path.basename(path.dirname(backupPath!))).toBe('.headlamp-plugin-updates');
    expect(PluginManager.list(pluginDestDir)).toHaveLength(1);
    expect(packageJson.artifacthub.version).toBe('0.2.0');
    await expect(
      verifyPluginExecutableIntegrity(pluginDir, 'bin/minikube', executable)
    ).resolves.toEqual({ ok: true });
    expect(consoleWarn).toHaveBeenCalledWith(
      'Failed to remove plugin update backup:',
      expect.any(Error)
    );

    removeSpy.mockRestore();
    renameSpy.mockRestore();
    consoleWarn.mockRestore();
    remove(pluginDestDir, { recursive: true, force: true });
    remove(testDataDir, { recursive: true, force: true });
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
 * Mock the ArtifactHub API responses for testing.
 *
 * @param testDataDir - Directory containing the mocked plugin archives.
 * @param version - Artifact Hub package version returned by the mock.
 * @param requestCount - Number of complete metadata and archive download cycles to serve.
 */
function mockArtifactHubAPI(testDataDir: string, version = '0.1.0') {
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
        package_id: 'fbc182b5-eb90-42b7-ace8-62a7576abafd',
        name: 'headlamp_minikube',
        display_name: 'Minikube',
        version,
        repository: {
          repository_id: '767e1f40-ee09-401b-b8d4-930740da5a8a',
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
          'headlamp/plugin/extra-files/0/output/minikube/output':
            os.platform() === 'win32' ? 'minikube.exe' : 'minikube',
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
        package_id: 'fbc182b5-eb90-42b7-ace8-62a7576abafd',
        name: 'headlamp_minikube',
        display_name: 'Minikube',
        version: '0.1.0',
        repository: {
          repository_id: '767e1f40-ee09-401b-b8d4-930740da5a8a',
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
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const annotations = {
        'headlamp/plugin/extra-files/0/url': 'http://localhost:1234/test.tar.gz',
        'headlamp/plugin/extra-files/0/checksum': 'sha256:dummy',
        'headlamp/plugin/extra-files/0/arch': 'linux/x64',
        'headlamp/plugin/extra-files/0/output/test/output': 'test',
        'headlamp/plugin/extra-files/0/output/test/input': 'test-linux-amd64',
      };
      expect(() => getExtraFiles(annotations)).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should return undefined if no extra-files annotation present', () => {
    const annotations = {
      'headlamp/plugin/archive-url':
        'https://github.com/kubernetes/minikube/releases/download/v1.0.0/minikube-linux-amd64.tar.gz',
    };
    expect(getExtraFiles(annotations)).toBeUndefined();
  });
});

describe('TLS error detection', () => {
  it('should detect TLS error when code is on err directly', async () => {
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'tls-error-direct-code');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'tls-error-direct-code-plugins');

    await createMinimalPluginTarball(testDataDir);

    mockArtifactHubAPIWithoutPlatformSpecific(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';

    const originalFetch = global.fetch;
    const tlsError = Object.assign(new Error('TLS verification failed'), {
      code: 'SELF_SIGNED_CERT_IN_CHAIN',
    });
    try {
      global.fetch = vi.fn().mockRejectedValue(tlsError);

      const installPromise = PluginManager.install(
        pluginURL,
        pluginDestDir,
        HEADLAMP_VERSION,
        null,
        null
      );

      await expect(installPromise).rejects.toThrow(
        'TLS certificate verification failed (SELF_SIGNED_CERT_IN_CHAIN).'
      );
      await expect(installPromise).rejects.toHaveProperty('cause', tlsError);
    } finally {
      global.fetch = originalFetch;

      if (fs.existsSync(pluginDestDir)) {
        fs.rmSync(pluginDestDir, { recursive: true });
      }
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true });
      }
    }
  }, 30000);

  it('should detect TLS error when code is in err.cause', async () => {
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'tls-error-cause-code');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'tls-error-cause-code-plugins');

    await createMinimalPluginTarball(testDataDir);

    mockArtifactHubAPIWithoutPlatformSpecific(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockRejectedValue(
        Object.assign(new Error('TLS verification failed'), {
          cause: { code: 'CERT_UNTRUSTED' },
        })
      );

      await expect(
        PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, null, null)
      ).rejects.toThrow('TLS certificate verification failed (CERT_UNTRUSTED).');
    } finally {
      global.fetch = originalFetch;

      if (fs.existsSync(pluginDestDir)) {
        fs.rmSync(pluginDestDir, { recursive: true });
      }
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true });
      }
    }
  }, 30000);

  it('should throw generic error when no TLS code is present', async () => {
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'tls-error-no-code');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'tls-error-no-code-plugins');

    await createMinimalPluginTarball(testDataDir);

    mockArtifactHubAPIWithoutPlatformSpecific(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockRejectedValue(
        Object.assign(new Error('Network error'), {
          code: 'ENOTFOUND',
        })
      );

      await expect(
        PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, null, null)
      ).rejects.toThrow('Failed to fetch plugin metadata. Please check your network connection.');
    } finally {
      global.fetch = originalFetch;

      if (fs.existsSync(pluginDestDir)) {
        fs.rmSync(pluginDestDir, { recursive: true });
      }
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true });
      }
    }
  }, 30000);

  it('should detect TLS error when the archive download fails', async () => {
    const testDataDir = getUniqueTestDir(TEST_DATA_BASE_DIR, 'tls-error-archive');
    const pluginDestDir = getUniqueTestDir(PLUGIN_DEST_BASE_DIR, 'tls-error-archive-plugins');

    await createMinimalPluginTarball(testDataDir);

    mockArtifactHubAPIWithoutPlatformSpecific(testDataDir);

    const pluginURL = 'https://artifacthub.io/packages/headlamp/test-repo/headlamp_minikube';

    const originalFetch = global.fetch;
    try {
      // Let the metadata fetch through so the failure happens on the archive download.
      global.fetch = vi.fn((...args: Parameters<typeof fetch>) => {
        const [url, init] = args;
        if (url.toString().includes('artifacthub.io')) {
          return originalFetch(url, init);
        }
        return Promise.reject(
          Object.assign(new Error('TLS verification failed'), {
            code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
          })
        );
      });

      await expect(
        PluginManager.install(pluginURL, pluginDestDir, HEADLAMP_VERSION, null, null)
      ).rejects.toThrow('TLS certificate verification failed (UNABLE_TO_GET_ISSUER_CERT_LOCALLY).');
    } finally {
      global.fetch = originalFetch;

      if (fs.existsSync(pluginDestDir)) {
        fs.rmSync(pluginDestDir, { recursive: true });
      }
      if (fs.existsSync(testDataDir)) {
        fs.rmSync(testDataDir, { recursive: true });
      }
    }
  }, 30000);
});
