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
  applyPlatformMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} from '../scripts/build-manifest.ts';
import {
  downloadFile,
  extractArchive,
  getArchiveFileName,
  pathsReferToSameFile,
  resolveLocalPluginArchive,
  validatePluginSource,
  verifyArchiveDigest,
} from '../scripts/setup-plugins.ts';

const require = createRequire(import.meta.url);
const { getConfig } = require('app-builder-lib/out/util/config/config');
const appPath = path.resolve(__dirname, '..');

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

    const config = await getConfig(appPath, 'electron-builder.config.ts', {});

    expect(config.linux.executableName).toBe('example-headlamp');
    expect(config.linux.category).toBe('Network');
    expect(config.mac.appId).toBe('io.example.headlamp');
    expect(config.win.icon).toBe('build/icons/example.ico');
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
      validatePluginSource({ name: 'local', file: './plugin.tar.gz', sha256: '0'.repeat(64) }, true)
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

  it('accepts matching digests and manifests without digests', () => {
    const archive = temporaryFile('plugin archive');
    const digest = crypto.createHash('sha256').update('plugin archive').digest('hex');

    expect(() => verifyArchiveDigest(archive, digest.toUpperCase())).not.toThrow();
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
