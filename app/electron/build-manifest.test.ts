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

import nock from 'nock';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyBuildResources,
  applyBuildTargets,
  applyPlatformMetadata,
  applyProductMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
  verifyPackagedResources,
} from '../scripts/build-manifest.ts';
import {
  applyEnabledByDefault,
  downloadFile,
  extractArchive,
  getArchiveFileName,
  pathsReferToSameFile,
  resolveLocalPluginArchive,
  validatePluginSource,
  verifyArchiveDigest,
  verifyPluginIdentity,
} from '../scripts/setup-plugins.ts';

const require = createRequire(import.meta.url);
const { getConfig } = require('app-builder-lib/out/util/config/config');
const appPath = path.resolve(__dirname, '..');

describe('build resource validation', () => {
  it.each([null, [], 'manifest'])('rejects an invalid manifest value: %j', manifest => {
    expect(() => applyBuildResources({}, manifest)).toThrow('Build manifest must be an object');
  });

  it('preserves the configuration when build resources are absent', () => {
    const defaults = { extraResources: [{ from: '/headlamp/frontend' }] };

    expect(applyBuildResources(defaults, {})).toBe(defaults);
  });

  it.each([null, [], 'resources'])('rejects an invalid resources value: %j', resources => {
    expect(() => applyBuildResources({}, { resources })).toThrow(
      'Build manifest resources must be an object'
    );
  });

  it('rejects unsupported resource groups', () => {
    expect(() => applyBuildResources({}, { resources: { windows: [] } })).toThrow(
      'Unsupported build manifest resource group: windows'
    );
  });

  it.each([null, {}, 'tools'])('rejects invalid common resources: %j', common => {
    expect(() => applyBuildResources({}, { resources: { common } })).toThrow(
      'Build manifest resources.common must be an array'
    );
  });

  it('resolves and appends common and platform resources without mutating defaults', () => {
    const manifestFile = path.join('/product', 'config', 'app-build-manifest.json');
    const manifestDirectory = path.dirname(manifestFile);
    const defaults = {
      extraResources: [{ from: '/headlamp/frontend' }],
      linux: { category: 'Network', extraResources: [{ from: '/headlamp/backend' }] },
      mac: { hardenedRuntime: true },
      win: null,
    };

    expect(
      applyBuildResources(
        defaults,
        {
          resources: {
            common: [{ from: '../shared', to: 'shared', filter: ['**/*'] }],
            linux: [{ from: './tools/linux', to: 'tools' }],
            mac: [{ from: './tools/mac' }],
            win: [{ from: '/absolute/tool.exe', to: 'tools/tool.exe' }],
          },
        },
        manifestFile
      )
    ).toEqual({
      extraResources: [
        { from: '/headlamp/frontend' },
        {
          from: path.resolve(manifestDirectory, '../shared'),
          to: 'shared',
          filter: ['**/*'],
        },
      ],
      linux: {
        category: 'Network',
        extraResources: [
          { from: '/headlamp/backend' },
          { from: path.resolve(manifestDirectory, './tools/linux'), to: 'tools' },
        ],
      },
      mac: {
        hardenedRuntime: true,
        extraResources: [{ from: path.resolve(manifestDirectory, './tools/mac') }],
      },
      win: {
        extraResources: [
          { from: path.resolve(manifestDirectory, '/absolute/tool.exe'), to: 'tools/tool.exe' },
        ],
      },
    });
    expect(defaults).toEqual({
      extraResources: [{ from: '/headlamp/frontend' }],
      linux: { category: 'Network', extraResources: [{ from: '/headlamp/backend' }] },
      mac: { hardenedRuntime: true },
      win: null,
    });
  });

  it.each([
    {
      commonResource: '../frontend/build',
      platformResource: { from: '../backend/headlamp-server', to: 'backend/headlamp-server' },
    },
    {
      commonResource: { from: '../frontend/build', to: 'frontend' },
      platformResource: '../backend/headlamp-server',
    },
  ])(
    'preserves singleton common and platform resources: %j',
    ({ commonResource, platformResource }) => {
      const manifestFile = path.join('/product', 'app-build-manifest.json');

      expect(
        applyBuildResources(
          {
            extraResources: commonResource,
            mac: { extraResources: platformResource },
          },
          {
            resources: {
              common: [{ from: './shared' }],
              mac: [{ from: './tools/mac' }],
            },
          },
          manifestFile
        )
      ).toEqual({
        extraResources: [
          commonResource,
          { from: path.resolve(path.dirname(manifestFile), './shared') },
        ],
        mac: {
          extraResources: [
            platformResource,
            { from: path.resolve(path.dirname(manifestFile), './tools/mac') },
          ],
        },
      });
    }
  );

  it.each([null, [], 'tools', {}, { to: 'tools' }, { from: 1 }, { from: 'tools', to: 1 }])(
    'rejects an invalid resource entry: %j',
    resource => {
      expect(() => applyBuildResources({}, { resources: { common: [resource] } })).toThrow(
        'Invalid build manifest resources.common[0]'
      );
    }
  );

  it.each([
    { from: 'tools', filter: 'bin' },
    { from: 'tools', filter: [1] },
    { from: 'tools', unsafe: true },
  ])('rejects invalid resource options: %j', resource => {
    expect(() => applyBuildResources({}, { resources: { mac: [resource] } })).toThrow(
      'Invalid build manifest resources.mac[0]'
    );
  });
});

describe('build target validation', () => {
  it('replaces platform targets without changing other platform settings', () => {
    expect(
      applyBuildTargets(
        { mac: { hardenedRuntime: true, target: ['zip'] } },
        { targets: { mac: [{ target: 'dmg', arch: ['arm64'] }] } }
      )
    ).toEqual({
      mac: { hardenedRuntime: true, target: [{ target: 'dmg', arch: ['arm64'] }] },
    });
  });

  it('rejects unknown architectures and empty target sets', () => {
    expect(() => applyBuildTargets({}, { targets: { mac: [] } })).toThrow('non-empty array');
    expect(() =>
      applyBuildTargets({}, { targets: { mac: [{ target: 'dmg', arch: ['mips'] }] } })
    ).toThrow('Invalid build manifest architecture for mac');
  });

  it('preserves the configuration when build targets are absent', () => {
    const defaults = { mac: { target: ['zip'] } };

    expect(applyBuildTargets(defaults, {})).toBe(defaults);
  });

  it.each([null, [], 'mac'])('rejects an invalid targets value: %j', targets => {
    expect(() => applyBuildTargets({}, { targets })).toThrow(
      'Build manifest targets must be an object'
    );
  });

  it('rejects unsupported target platforms', () => {
    expect(() => applyBuildTargets({}, { targets: { windows: ['nsis'] } })).toThrow(
      'Unsupported build manifest target platform: windows'
    );
  });

  it.each([null, {}, 'dmg', []])('rejects invalid mac targets: %j', mac => {
    expect(() => applyBuildTargets({}, { targets: { mac } })).toThrow(
      'Build manifest targets.mac must be a non-empty array'
    );
  });

  it('accepts string targets for every supported platform', () => {
    expect(
      applyBuildTargets(
        {
          linux: { category: 'Network' },
          mac: { hardenedRuntime: true },
          win: { artifactName: 'headlamp-${version}.${ext}' },
        },
        { targets: { linux: ['AppImage'], mac: ['dmg'], win: ['nsis'] } }
      )
    ).toEqual({
      linux: { category: 'Network', target: ['AppImage'] },
      mac: { hardenedRuntime: true, target: ['dmg'] },
      win: { artifactName: 'headlamp-${version}.${ext}', target: ['nsis'] },
    });
  });

  it.each([
    { platform: 'linux', architectures: ['arm64', 'armv7l', 'x64'] },
    { platform: 'mac', architectures: ['arm64', 'universal', 'x64'] },
    { platform: 'win', architectures: ['arm64', 'ia32', 'x64'] },
  ])('accepts supported $platform architectures', ({ platform, architectures }) => {
    expect(
      applyBuildTargets(
        {},
        { targets: { [platform]: [{ target: 'package', arch: architectures }] } }
      )
    ).toEqual({
      [platform]: { target: [{ target: 'package', arch: architectures }] },
    });
  });

  it.each([
    { platform: 'linux', architecture: 'ia32' },
    { platform: 'linux', architecture: 'universal' },
    { platform: 'mac', architecture: 'armv7l' },
    { platform: 'mac', architecture: 'ia32' },
    { platform: 'win', architecture: 'armv7l' },
    { platform: 'win', architecture: 'universal' },
  ])('rejects $architecture for $platform', ({ platform, architecture }) => {
    expect(() =>
      applyBuildTargets(
        {},
        { targets: { [platform]: [{ target: 'package', arch: [architecture] }] } }
      )
    ).toThrow(`Invalid build manifest architecture for ${platform}`);
  });

  it.each([null, {}, { target: 1, arch: [] }, { target: 'dmg', arch: 'arm64' }])(
    'rejects an invalid mac target descriptor: %j',
    target => {
      expect(() => applyBuildTargets({}, { targets: { mac: [target] } })).toThrow(
        'Invalid build manifest target for mac'
      );
    }
  );

  it.each(['', '  ', { target: '', arch: ['arm64'] }, { target: '  ', arch: ['arm64'] }])(
    'rejects a blank mac target name: %j',
    target => {
      expect(() => applyBuildTargets({}, { targets: { mac: [target] } })).toThrow(
        'Invalid build manifest target for mac'
      );
    }
  );

  it('rejects an empty architecture list', () => {
    expect(() =>
      applyBuildTargets({}, { targets: { linux: [{ target: 'AppImage', arch: [] }] } })
    ).toThrow('Invalid build manifest architecture for linux');
  });
});

describe('platform metadata', () => {
  afterEach(() => {
    delete process.env.HEADLAMP_BUILD_MANIFEST;
  });

  it.each([null, [], 'manifest'])('rejects an invalid manifest value: %j', manifest => {
    expect(() => applyPlatformMetadata({}, manifest)).toThrow('Build manifest must be an object');
  });

  it('preserves the configuration when platform metadata is absent', () => {
    const defaults = { linux: { category: 'Network' } };

    expect(applyPlatformMetadata(defaults, {})).toBe(defaults);
  });

  it.each([null, [], 'linux'])('rejects an invalid platforms value: %j', platforms => {
    expect(() => applyPlatformMetadata({}, { platforms })).toThrow(
      'Build manifest platforms must be an object'
    );
  });

  it('overrides allowed fields for every supported platform', () => {
    const defaults = {
      linux: { category: 'Network', executableName: 'headlamp' },
      mac: { hardenedRuntime: true },
      win: { target: ['nsis'] },
    };

    expect(
      applyPlatformMetadata(defaults, {
        platforms: {
          linux: { executableName: 'example', icon: '/product/linux.png' },
          mac: { appId: 'io.example.app', bundleShortVersion: '1.2.3', bundleVersion: '123' },
          win: { artifactName: 'example-${version}.${ext}', icon: '/product/windows.ico' },
        },
      })
    ).toEqual({
      linux: {
        category: 'Network',
        executableName: 'example',
        icon: '/product/linux.png',
      },
      mac: {
        hardenedRuntime: true,
        appId: 'io.example.app',
        bundleShortVersion: '1.2.3',
        bundleVersion: '123',
      },
      win: {
        target: ['nsis'],
        artifactName: 'example-${version}.${ext}',
        icon: '/product/windows.ico',
      },
    });
    expect(defaults.linux).toEqual({ category: 'Network', executableName: 'headlamp' });
  });

  it.each([null, [], 'linux'])('rejects invalid platform metadata: %j', metadata => {
    expect(() => applyPlatformMetadata({}, { platforms: { linux: metadata } })).toThrow(
      'Build manifest platforms.linux must be an object'
    );
  });

  it('rejects arbitrary electron-builder platform settings', () => {
    expect(() =>
      applyPlatformMetadata({}, { platforms: { mac: { hardenedRuntime: false } } })
    ).toThrow('Unsupported build manifest platforms.mac.hardenedRuntime');
  });

  it('rejects non-string allowed settings', () => {
    expect(() =>
      applyPlatformMetadata({}, { platforms: { win: { artifactName: false } } })
    ).toThrow('Build manifest platforms.win.artifactName must be a string');
  });

  it('applies a selected manifest to the Electron Builder configuration', async () => {
    process.env.HEADLAMP_BUILD_MANIFEST = require.resolve(
      './fixtures/platform-build-manifest.json'
    );

    vi.resetModules();
    const { default: config } = await import('../electron-builder.config.ts');

    expect(config.linux).toMatchObject({
      executableName: 'example-headlamp',
      category: 'Network',
    });
    expect(config.mac).toMatchObject({ appId: 'io.example.headlamp' });
    expect(config.win).toMatchObject({ icon: 'build/icons/example.ico' });
  });
});

describe('product metadata', () => {
  it.each([null, [], 'manifest'])('rejects an invalid manifest value: %j', manifest => {
    expect(() => applyProductMetadata({}, manifest)).toThrow('Build manifest must be an object');
  });

  it('preserves the configuration when product metadata is absent', () => {
    const defaults = { appId: 'io.headlamp', productName: 'Headlamp' };

    expect(applyProductMetadata(defaults, {})).toBe(defaults);
  });

  it.each([null, [], 'headlamp'])('rejects an invalid product value: %j', product => {
    expect(() => applyProductMetadata({}, { product })).toThrow(
      'Build manifest product must be an object'
    );
  });

  it('applies product identity while preserving unrelated defaults', () => {
    const defaults = {
      appId: 'io.headlamp',
      productName: 'Headlamp',
      category: 'Network',
      extraMetadata: { channel: 'stable' },
    };

    expect(
      applyProductMetadata(defaults, {
        product: {
          name: 'example-desktop',
          productName: 'Example Desktop',
          version: '1.2.3',
          appId: 'io.example.desktop',
          artifactName: '${name}-${version}.${ext}',
          protocols: { name: 'example', schemes: ['example'] },
        },
      })
    ).toEqual({
      appId: 'io.example.desktop',
      productName: 'Example Desktop',
      category: 'Network',
      artifactName: '${name}-${version}.${ext}',
      protocols: { name: 'example', schemes: ['example'] },
      buildVersion: '1.2.3',
      extraMetadata: {
        channel: 'stable',
        name: 'example-desktop',
        productName: 'Example Desktop',
        version: '1.2.3',
      },
    });
    expect(defaults).toEqual({
      appId: 'io.headlamp',
      productName: 'Headlamp',
      category: 'Network',
      extraMetadata: { channel: 'stable' },
    });
  });

  it.each(['name', 'productName', 'version', 'appId', 'artifactName'])(
    'rejects a non-string product.%s',
    field => {
      expect(() => applyProductMetadata({}, { product: { [field]: 1 } })).toThrow(
        `Build manifest product.${field} must be a string`
      );
    }
  );

  it.each([null, [], 'example'])('rejects invalid product protocols: %j', protocols => {
    expect(() => applyProductMetadata({}, { product: { protocols } })).toThrow(
      'Build manifest product.protocols must be an object'
    );
  });

  it.each([undefined, null, [], 'example', [''], [1], ['example', 2]])(
    'rejects protocols without a usable schemes list: %j',
    schemes => {
      expect(() =>
        applyProductMetadata({}, { product: { protocols: { name: 'example', schemes } } })
      ).toThrow('Build manifest product.protocols.schemes must be a non-empty array of strings');
    }
  );

  it.each([null, [], 'metadata'])(
    'replaces malformed inherited extra metadata: %j',
    extraMetadata => {
      expect(
        applyProductMetadata({ extraMetadata }, { product: { name: 'example-desktop' } })
          .extraMetadata
      ).toEqual({ name: 'example-desktop' });
    }
  );

  it('applies a selected product manifest to the Electron Builder configuration', async () => {
    const manifestFile = temporaryFile(
      JSON.stringify({
        product: {
          name: 'example-desktop',
          productName: 'Example Desktop',
          version: '1.2.3',
          appId: 'io.example.desktop',
        },
      })
    );
    process.env.HEADLAMP_BUILD_MANIFEST = manifestFile;

    const config = await getConfig(appPath, 'electron-builder.config.ts', {});

    expect(config.appId).toBe('io.example.desktop');
    expect(config.productName).toBe('Example Desktop');
    expect(config.buildVersion).toBe('1.2.3');
    expect(config.extraMetadata).toMatchObject({
      name: 'example-desktop',
      productName: 'Example Desktop',
      version: '1.2.3',
    });
  });
});

const temporaryDirectories: string[] = [];

afterEach(() => {
  nock.cleanAll();
  delete process.env.HEADLAMP_BUILD_MANIFEST;
  temporaryDirectories
    .splice(0)
    .forEach(directory => fs.rmSync(directory, { recursive: true, force: true }));
});

function temporaryFile(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-build-manifest-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'manifest.json');
  fs.writeFileSync(file, contents);
  return file;
}

describe('packaged resource verification', () => {
  it('preserves packages when verification is absent', () => {
    expect(() => verifyPackagedResources('/missing', {}, 'linux')).not.toThrow();
  });

  it.each([
    { runtimePlatform: 'darwin', manifestPlatform: 'mac' },
    { runtimePlatform: 'mas', manifestPlatform: 'mac' },
    { runtimePlatform: 'win32', manifestPlatform: 'win' },
    { runtimePlatform: 'linux', manifestPlatform: 'linux' },
  ])(
    'accepts a matching digest for $runtimePlatform packages',
    ({ runtimePlatform, manifestPlatform }) => {
      const file = temporaryFile('bundled tool');
      const digest = crypto.createHash('sha256').update('bundled tool').digest('hex').toUpperCase();

      expect(() =>
        verifyPackagedResources(
          path.dirname(file),
          {
            verify: [{ path: path.basename(file), sha256: digest, platforms: [manifestPlatform] }],
          },
          runtimePlatform
        )
      ).not.toThrow();
    }
  );

  it('skips entries for other packaged platforms', () => {
    expect(() =>
      verifyPackagedResources(
        '/missing',
        { verify: [{ path: 'tool.exe', sha256: '0'.repeat(64), platforms: ['win'] }] },
        'linux'
      )
    ).not.toThrow();
  });

  it.each([null, [], 'manifest'])('rejects an invalid manifest value: %j', manifest => {
    expect(() => verifyPackagedResources('/resources', manifest, 'linux')).toThrow(
      'Build manifest must be an object'
    );
  });

  it.each([null, {}, 'resource'])('rejects an invalid verify value: %j', verify => {
    expect(() => verifyPackagedResources('/resources', { verify }, 'linux')).toThrow(
      'Build manifest verify must be an array'
    );
  });

  it.each([
    null,
    [],
    'resource',
    {},
    { path: '', sha256: '0'.repeat(64) },
    { path: 1, sha256: '0'.repeat(64) },
    { path: 'tool', sha256: 1 },
    { path: 'tool', sha256: '0'.repeat(64), platforms: 'linux' },
    { path: 'tool', sha256: '0'.repeat(64), platforms: ['android'] },
    { path: 'tool', sha256: '0'.repeat(64), unsafe: true },
  ])('rejects an invalid verification entry: %j', verification => {
    expect(() =>
      verifyPackagedResources('/resources', { verify: [verification] }, 'linux')
    ).toThrow('Invalid build manifest verify[0]');
  });

  it.each(['0', 'g'.repeat(64), `${'0'.repeat(64)}00`])(
    'rejects an invalid SHA-256 digest: %s',
    sha256 => {
      expect(() =>
        verifyPackagedResources('/resources', { verify: [{ path: 'tool', sha256 }] }, 'linux')
      ).toThrow('Invalid SHA-256 for packaged resource tool');
    }
  );

  it.each(['../tool', '/outside/tool'])(
    'rejects a resource path outside the package: %s',
    entry => {
      const resourcesDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-resources-'));
      temporaryDirectories.push(resourcesDirectory);

      expect(() =>
        verifyPackagedResources(
          resourcesDirectory,
          { verify: [{ path: entry, sha256: '0'.repeat(64) }] },
          'linux'
        )
      ).toThrow('escapes the resources directory');
    }
  );

  it('rejects resources reached through a parent directory symlink', () => {
    const resourcesDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-resources-'));
    const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-outside-'));
    temporaryDirectories.push(resourcesDirectory, outsideDirectory);
    const contents = 'bundled tool';
    fs.writeFileSync(path.join(outsideDirectory, 'tool'), contents);
    fs.symlinkSync(
      outsideDirectory,
      path.join(resourcesDirectory, 'tools'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    expect(() =>
      verifyPackagedResources(
        resourcesDirectory,
        {
          verify: [
            {
              path: 'tools/tool',
              sha256: crypto.createHash('sha256').update(contents).digest('hex'),
            },
          ],
        },
        'linux'
      )
    ).toThrow('escapes the resources directory');
  });

  it.each([
    { name: 'missing files', prepare: () => undefined },
    { name: 'directories', prepare: (resource: string) => fs.mkdirSync(resource) },
    {
      name: 'symbolic links',
      prepare: (resource: string) => {
        const target = `${resource}-target`;
        fs.writeFileSync(target, 'bundled tool');
        fs.symlinkSync(target, resource);
      },
    },
  ])('rejects $name', ({ prepare }) => {
    const resourcesDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-resources-'));
    temporaryDirectories.push(resourcesDirectory);
    const resource = path.join(resourcesDirectory, 'tool');
    prepare(resource);

    expect(() =>
      verifyPackagedResources(
        resourcesDirectory,
        { verify: [{ path: 'tool', sha256: '0'.repeat(64) }] },
        'linux'
      )
    ).toThrow('Packaged resource is not a regular file: tool');
  });

  it('rejects digest mismatches', () => {
    const file = temporaryFile('bundled tool');

    expect(() =>
      verifyPackagedResources(
        path.dirname(file),
        { verify: [{ path: path.basename(file), sha256: '0'.repeat(64) }] },
        'linux'
      )
    ).toThrow(`SHA-256 mismatch for packaged resource ${path.basename(file)}`);
  });

  it('hashes packaged resources without reading the whole file at once', () => {
    const contents = Buffer.alloc(128 * 1024, 'a');
    const resourcesDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-resources-'));
    temporaryDirectories.push(resourcesDirectory);
    fs.writeFileSync(path.join(resourcesDirectory, 'tool'), contents);
    const readFileSync = vi.spyOn(fs, 'readFileSync');

    try {
      expect(() =>
        verifyPackagedResources(
          resourcesDirectory,
          {
            verify: [
              {
                path: 'tool',
                sha256: crypto.createHash('sha256').update(contents).digest('hex'),
              },
            ],
          },
          'linux'
        )
      ).not.toThrow();
      expect(readFileSync).not.toHaveBeenCalled();
    } finally {
      readFileSync.mockRestore();
    }
  });
});

describe('build manifest selection', () => {
  it('uses Headlamp defaults when no product manifest is configured', () => {
    expect(resolveBuildManifestPath({}, '/product')).toBe(DEFAULT_MANIFEST_FILE);
  });

  it('resolves and loads an external product manifest', () => {
    const manifestFile = temporaryFile('{"plugins":[{"name":"example"}]}');

    expect(
      resolveBuildManifestPath(
        { HEADLAMP_BUILD_MANIFEST: './manifest.json' },
        path.dirname(manifestFile)
      )
    ).toBe(manifestFile);
    expect(loadBuildManifest(manifestFile)).toEqual({ plugins: [{ name: 'example' }] });
  });

  it('loads the default manifest when no path is supplied', () => {
    expect(loadBuildManifest()).toEqual(expect.objectContaining({ plugins: expect.any(Array) }));
  });

  it('rejects unsafe proxy URL patterns', () => {
    for (const proxyUrls of [
      ['file:///etc/passwd'],
      ['https://example.com/*,https://attacker.example/*'],
      ['https://*.example.com/*'],
      ['https://example.com/['],
      [42],
      'https://example.com/*',
    ]) {
      const manifestFile = temporaryFile(JSON.stringify({ 'proxy-urls': proxyUrls }));
      expect(() => loadBuildManifest(manifestFile)).toThrow('proxy-urls');
    }
  });

  it('packages the selected manifest under the runtime filename', async () => {
    const manifestFile = temporaryFile('{"plugins":[]}');
    process.env.HEADLAMP_BUILD_MANIFEST = manifestFile;

    vi.resetModules();
    const { default: config } = await import('../electron-builder.config.ts');
    expect(config.extraResources).toContainEqual({
      from: manifestFile,
      to: 'app-build-manifest.json',
    });
    expect(config.extraResources).toContainEqual({
      from: '../frontend/build',
      to: 'frontend',
    });
  });

  it('rejects an invalid selected manifest before packaging', async () => {
    const manifestFile = temporaryFile('{"proxy-urls":["file:///etc/passwd"]}');
    process.env.HEADLAMP_BUILD_MANIFEST = manifestFile;

    vi.resetModules();
    await expect(import('../electron-builder.config.ts')).rejects.toThrow('proxy-urls');
  });

  it('pins SHA-256 digests for every bundled plugin archive', () => {
    const bundledManifest = loadBuildManifest(DEFAULT_MANIFEST_FILE) as {
      plugins?: Array<{ archive?: string; sha256?: string }>;
    };
    const bundledArchives = bundledManifest.plugins?.filter(plugin => plugin.archive) ?? [];

    expect(bundledArchives.length).toBeGreaterThan(0);
    for (const plugin of bundledArchives) {
      expect(plugin.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

describe('plugin archive integrity', () => {
  it('rejects missing and malformed plugin archives', async () => {
    const extractionDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'headlamp-plugin-extraction-')
    );
    temporaryDirectories.push(extractionDirectory);
    const malformedArchive = temporaryFile('not a gzip archive');

    await expect(
      extractArchive('missing', path.join(extractionDirectory, 'missing.tar.gz'))
    ).rejects.toThrow();
    await expect(
      extractArchive('malformed', malformedArchive, extractionDirectory)
    ).rejects.toThrow();
  });

  it('limits extracted entries and rejects symbolic links', async () => {
    const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-tar-source-'));
    const extractionDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'headlamp-plugin-extraction-')
    );
    temporaryDirectories.push(sourceDirectory, extractionDirectory);
    fs.mkdirSync(path.join(sourceDirectory, 'plugin'));
    fs.writeFileSync(path.join(sourceDirectory, 'plugin', 'main.js'), 'main');
    fs.writeFileSync(path.join(sourceDirectory, 'plugin', 'package.json'), '{}');
    const archive = path.join(sourceDirectory, 'plugin.tar.gz');
    await tar.c({ cwd: sourceDirectory, file: archive, gzip: true }, ['plugin']);

    await expect(
      extractArchive('limited', archive, extractionDirectory, undefined, {
        maxEntries: 1,
        maxBytes: 1024,
      })
    ).rejects.toThrow('entry limit');

    fs.symlinkSync('main.js', path.join(sourceDirectory, 'plugin', 'linked-main.js'));
    const linkedArchive = path.join(sourceDirectory, 'linked-plugin.tar.gz');
    await tar.c({ cwd: sourceDirectory, file: linkedArchive, gzip: true }, ['plugin']);
    await expect(extractArchive('linked', linkedArchive, extractionDirectory)).rejects.toThrow(
      'link'
    );
  });

  it('rejects unsafe or empty plugin names', () => {
    for (const name of ['', '   ', '.', '..', '../outside', 'nested/plugin', 'nested\\plugin']) {
      expect(() => validatePluginSource({ name, file: './plugin.tar.gz' }, true)).toThrow(
        'Invalid plugin name'
      );
    }
  });

  it('requires exactly one non-empty plugin source', () => {
    expect(() => validatePluginSource({ name: 'missing' }, true)).toThrow('exactly one source');
    expect(() => validatePluginSource({ name: 'empty', archive: '' }, true)).toThrow(
      'must not be empty'
    );
    expect(() =>
      validatePluginSource(
        {
          name: 'duplicate',
          archive: 'https://plugins.example/plugin.tar.gz',
          file: './plugin.tar.gz',
          sha256: '0'.repeat(64),
        },
        true
      )
    ).toThrow('exactly one source');
  });

  it('requires digests only for remote archives in external manifests', () => {
    expect(() =>
      validatePluginSource(
        { name: 'example', archive: 'https://plugins.example/plugin.tar.gz' },
        true
      )
    ).toThrow('must declare a SHA-256 digest');
    expect(() =>
      validatePluginSource(
        {
          name: 'example',
          packageName: 'example-plugin',
          archive: 'https://plugins.example/plugin.tar.gz',
          sha256: '0'.repeat(64),
        },
        true
      )
    ).not.toThrow();
    expect(() => validatePluginSource({ name: 'local', file: './plugin.tar.gz' }, true)).toThrow(
      'must declare a SHA-256 digest'
    );
    expect(() =>
      validatePluginSource(
        {
          name: 'local',
          packageName: 'local-plugin',
          file: './plugin.tar.gz',
          sha256: '0'.repeat(64),
        },
        true
      )
    ).not.toThrow();
    expect(() =>
      validatePluginSource(
        { name: 'bundled', archive: 'https://plugins.example/plugin.tar.gz' },
        false
      )
    ).not.toThrow();
  });

  it('recognizes equivalent paths to the default manifest', () => {
    expect(
      pathsReferToSameFile(
        DEFAULT_MANIFEST_FILE,
        path.join(path.dirname(DEFAULT_MANIFEST_FILE), '.', path.basename(DEFAULT_MANIFEST_FILE))
      )
    ).toBe(true);
  });

  it('rejects malformed digests before downloading remote archives', () => {
    expect(() =>
      validatePluginSource(
        {
          name: 'example',
          archive: 'https://plugins.example/plugin.tar.gz',
          sha256: 'not-a-digest',
        },
        true
      )
    ).toThrow('Invalid SHA-256');
  });

  it('rejects non-boolean default enabled states', () => {
    expect(() =>
      validatePluginSource(
        {
          name: 'example',
          file: './plugin.tar.gz',
          enabledByDefault: 'false' as unknown as boolean,
        },
        false
      )
    ).toThrow('enabledByDefault must be a boolean');
  });

  it('accepts matching digests and manifests without digests', () => {
    const archive = temporaryFile('plugin archive');
    const digest = crypto.createHash('sha256').update('plugin archive').digest('hex');
    const readFile = vi.spyOn(fs, 'readFileSync');

    expect(() => verifyArchiveDigest(archive, digest.toUpperCase())).not.toThrow();
    expect(readFile).not.toHaveBeenCalled();
    expect(() => verifyArchiveDigest(archive, undefined)).not.toThrow();
  });

  it('verifies files larger than the hashing buffer', () => {
    const archive = temporaryFile('plugin archive'.repeat(10_000));
    const digest = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');

    expect(() => verifyArchiveDigest(archive, digest)).not.toThrow();
  });

  it('rejects mismatched and malformed digests', () => {
    const archive = temporaryFile('plugin archive');

    expect(() => verifyArchiveDigest(archive, '0'.repeat(64))).toThrow('SHA-256 mismatch');
    expect(() => verifyArchiveDigest(archive, 'not-a-digest')).toThrow('Invalid SHA-256');
  });

  it('confines local plugin files to the manifest directory', () => {
    const manifestDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-manifest-'));
    const outsideDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-outside-'));
    temporaryDirectories.push(manifestDirectory, outsideDirectory);
    const manifestFile = path.join(manifestDirectory, 'manifest.json');
    const localArchive = path.join(manifestDirectory, 'plugin.tar.gz');
    const outsideArchive = path.join(outsideDirectory, 'outside.tar.gz');
    fs.writeFileSync(manifestFile, '{}');
    fs.writeFileSync(localArchive, 'local');
    fs.writeFileSync(outsideArchive, 'outside');

    expect(resolveLocalPluginArchive(manifestFile, './plugin.tar.gz')).toBe(
      fs.realpathSync.native(localArchive)
    );
    expect(() => resolveLocalPluginArchive(manifestFile, '../outside.tar.gz')).toThrow(
      'within the manifest directory'
    );
    expect(() => resolveLocalPluginArchive(manifestFile, outsideArchive)).toThrow(
      'must be relative'
    );
    fs.symlinkSync(outsideArchive, path.join(manifestDirectory, 'linked.tar.gz'));
    expect(() => resolveLocalPluginArchive(manifestFile, './linked.tar.gz')).toThrow(
      'within the manifest directory'
    );
  });

  it('requires valid package names only for external manifests', () => {
    const validPlugin = {
      name: 'example',
      packageName: '@example/plugin',
      file: './plugin.tar.gz',
      sha256: '0'.repeat(64),
    };

    expect(() => validatePluginSource(validPlugin, true)).not.toThrow();
    expect(() => validatePluginSource({ ...validPlugin, packageName: undefined }, true)).toThrow(
      'must declare a valid package name'
    );
    expect(() =>
      validatePluginSource({ ...validPlugin, packageName: 'invalid package' }, true)
    ).toThrow('must declare a valid package name');
    expect(() =>
      validatePluginSource({ ...validPlugin, packageName: '@Example/plugin' }, true)
    ).toThrow('must declare a valid package name');
    expect(() =>
      validatePluginSource(
        { name: 'bundled', archive: 'https://plugins.example/plugin.tar.gz' },
        false
      )
    ).not.toThrow();
  });

  it.each(['CON', 'nul.txt', 'COM1', 'lpt9.log', 'plugin.', 'plugin '])(
    'rejects an unsafe external plugin name: %j',
    name => {
      expect(() =>
        validatePluginSource(
          {
            name,
            packageName: 'example-plugin',
            file: './plugin.tar.gz',
            sha256: '0'.repeat(64),
          },
          true
        )
      ).toThrow('Invalid plugin name');
    }
  );
  it('accepts matching package identities and rejects mismatches', () => {
    const packageJson = temporaryFile('{"name":"@example/plugin"}');

    expect(() => verifyPluginIdentity(packageJson, '@example/plugin')).not.toThrow();
    expect(() => verifyPluginIdentity(packageJson, '@other/plugin')).toThrow(
      'Plugin package name mismatch'
    );
    expect(() => verifyPluginIdentity(packageJson, undefined)).not.toThrow();
  });

  it('reports package metadata errors with identity context', () => {
    const malformedPackageJson = temporaryFile('{not-json');
    const missingPackageJson = path.join(path.dirname(malformedPackageJson), 'missing.json');

    expect(() => verifyPluginIdentity(malformedPackageJson, '@example/plugin')).toThrow(
      'Plugin identity verification failed for @example/plugin'
    );
    expect(() => verifyPluginIdentity(missingPackageJson, '@example/plugin')).toThrow(
      'Plugin identity verification failed for @example/plugin'
    );
  });
});

describe('bundled plugin default metadata', () => {
  function pluginPackage(contents: string = '{"name":"example"}') {
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-default-'));
    temporaryDirectories.push(pluginRoot);
    const pluginDirectory = path.join(pluginRoot, 'example');
    fs.mkdirSync(pluginDirectory);
    const packageJsonPath = path.join(pluginDirectory, 'package.json');
    fs.writeFileSync(packageJsonPath, contents);
    return { pluginRoot, packageJsonPath };
  }

  it('atomically preserves package metadata while applying a disabled default', () => {
    const { pluginRoot, packageJsonPath } = pluginPackage(
      '{"name":"example","headlamp":{"i18n":["en"]}}'
    );
    const rename = vi.spyOn(fs, 'renameSync');

    applyEnabledByDefault(pluginRoot, 'example', false);

    expect(rename).toHaveBeenCalledWith(expect.stringContaining('.tmp-'), packageJsonPath);
    expect(JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))).toEqual({
      name: 'example',
      headlamp: { i18n: ['en'], enabledByDefault: false },
    });
    expect(fs.readdirSync(path.dirname(packageJsonPath))).toEqual(['package.json']);
    rename.mockRestore();
  });

  it('fails closed when an explicit default cannot be applied', () => {
    const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-plugin-default-'));
    temporaryDirectories.push(missingRoot);
    expect(() => applyEnabledByDefault(missingRoot, 'missing', false)).toThrow(
      'package.json is missing'
    );

    const { pluginRoot, packageJsonPath } = pluginPackage('{invalid json');
    expect(() => applyEnabledByDefault(pluginRoot, 'example', false)).toThrow(
      'Failed to apply enabledByDefault'
    );
    expect(fs.readFileSync(packageJsonPath, 'utf8')).toBe('{invalid json');
    expect(fs.readdirSync(path.dirname(packageJsonPath))).toEqual(['package.json']);
  });

  it('leaves package metadata unchanged when no default is declared', () => {
    const { pluginRoot, packageJsonPath } = pluginPackage();

    applyEnabledByDefault(pluginRoot, 'example');

    expect(fs.readFileSync(packageJsonPath, 'utf8')).toBe('{"name":"example"}');
  });
});

describe('plugin archive download', () => {
  it('derives safe archive names without query strings', () => {
    expect(getArchiveFileName('https://plugins.example/plugin.tar.gz?token=secret')).toBe(
      'plugin.tar.gz'
    );
    expect(() => getArchiveFileName('https://plugins.example/')).toThrow(
      'does not contain a file name'
    );
  });

  it('downloads successful responses', async () => {
    const destination = temporaryFile('');
    nock('https://plugins.example').get('/plugin.tar.gz').reply(200, 'archive');

    await expect(
      downloadFile('https://plugins.example/plugin.tar.gz', destination)
    ).resolves.toBeUndefined();
    expect(fs.readFileSync(destination, 'utf8')).toBe('archive');
  });

  it('follows relative HTTPS redirects', async () => {
    const destination = temporaryFile('');
    nock('https://plugins.example')
      .get('/latest')
      .reply(302, undefined, { Location: '/plugin.tar.gz' });
    nock('https://plugins.example').get('/plugin.tar.gz').reply(200, 'archive');

    await expect(
      downloadFile('https://plugins.example/latest', destination)
    ).resolves.toBeUndefined();
  });

  it('uses one timeout budget across redirects', async () => {
    const destination = temporaryFile('');
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(1_000);
    nock('https://plugins.example').get('/latest').reply(302, undefined, {
      Location: '/plugin.tar.gz',
    });

    const download = downloadFile('https://plugins.example/latest', destination, 0, {
      maxBytes: 1024,
      timeoutMs: 10,
    });
    now.mockReturnValue(1_010);

    await expect(download).rejects.toThrow('timed out after 10ms');
    expect(fs.existsSync(destination)).toBe(false);
    now.mockRestore();
  });

  it('follows only 3xx redirects to allowed HTTPS hosts', async () => {
    const destination = temporaryFile('');
    nock('https://plugins.example')
      .get('/not-a-redirect')
      .reply(200, 'archive', { Location: '/other.tar.gz' });
    await downloadFile('https://plugins.example/not-a-redirect', destination);
    expect(fs.readFileSync(destination, 'utf8')).toBe('archive');

    nock('https://plugins.example')
      .get('/cross-host')
      .reply(302, undefined, { Location: 'https://attacker.example/plugin.tar.gz' });
    await expect(downloadFile('https://plugins.example/cross-host', destination)).rejects.toThrow(
      'redirect host'
    );
  });

  it('limits download size and duration and removes partial files', async () => {
    const destination = temporaryFile('');
    nock('https://plugins.example')
      .get('/large.tar.gz')
      .reply(200, 'archive', { 'Content-Length': '7' });
    await expect(
      downloadFile('https://plugins.example/large.tar.gz', destination, 0, {
        maxBytes: 3,
        timeoutMs: 1000,
      })
    ).rejects.toThrow('size limit');
    expect(fs.existsSync(destination)).toBe(false);

    nock('https://plugins.example').get('/slow.tar.gz').delayConnection(50).reply(200, 'archive');
    await expect(
      downloadFile('https://plugins.example/slow.tar.gz', destination, 0, {
        maxBytes: 1024,
        timeoutMs: 10,
      })
    ).rejects.toThrow('timed out');
    expect(fs.existsSync(destination)).toBe(false);
  });

  it('rejects invalid, insecure, and redirect-downgraded URLs', async () => {
    const destination = temporaryFile('');

    await expect(downloadFile('not a URL', destination)).rejects.toThrow(
      'Invalid plugin archive URL'
    );
    await expect(downloadFile('http://plugins.example/plugin.tar.gz', destination)).rejects.toThrow(
      'must use HTTPS'
    );

    nock('https://plugins.example')
      .get('/plugin.tar.gz')
      .reply(302, undefined, { Location: 'http://plugins.example/plugin.tar.gz' });
    await expect(
      downloadFile('https://plugins.example/plugin.tar.gz', destination)
    ).rejects.toThrow('must use HTTPS');

    nock('https://plugins.example')
      .get('/malformed-redirect')
      .reply(302, undefined, { Location: 'https://[' });
    await expect(
      downloadFile('https://plugins.example/malformed-redirect', destination)
    ).rejects.toThrow('Invalid plugin archive redirect URL');
  });

  it('rejects unsuccessful responses and excessive redirects', async () => {
    const destination = temporaryFile('');
    nock('https://plugins.example').get('/missing.tar.gz').reply(404);

    await expect(
      downloadFile('https://plugins.example/missing.tar.gz', destination)
    ).rejects.toThrow('status 404');
    await expect(
      downloadFile('https://plugins.example/plugin.tar.gz', destination, 6)
    ).rejects.toThrow('Too many redirects');
  });
});
