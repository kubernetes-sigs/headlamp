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
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  applyProductMetadata,
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} = require('../scripts/build-manifest');
const {
  downloadFile,
  validatePluginSource,
  verifyArchiveDigest,
  verifyPluginIdentity,
} = require('../scripts/setup-plugins');

const temporaryDirectories: string[] = [];

afterEach(() => {
  nock.cleanAll();
  delete process.env.HEADLAMP_BUILD_MANIFEST;
  delete require.cache[require.resolve('../electron-builder.config')];
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

  it('packages the selected manifest under the runtime filename', () => {
    const manifestFile = temporaryFile('{"plugins":[]}');
    process.env.HEADLAMP_BUILD_MANIFEST = manifestFile;

    const config = require('../electron-builder.config');
    expect(config.extraResources).toContainEqual({
      from: manifestFile,
      to: 'app-build-manifest.json',
    });
    expect(config.extraResources).toContainEqual({
      from: '../frontend/build',
      to: 'frontend',
    });
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

  it('applies a selected product manifest to the Electron Builder configuration', () => {
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

    const config = require('../electron-builder.config');

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

describe('plugin archive integrity', () => {
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
    expect(() =>
      validatePluginSource(
        { name: 'local', packageName: 'local-plugin', file: './plugin.tar.gz' },
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

  it('accepts matching digests and manifests without digests', () => {
    const archive = temporaryFile('plugin archive');
    const digest = crypto.createHash('sha256').update('plugin archive').digest('hex');

    expect(() => verifyArchiveDigest(archive, digest.toUpperCase())).not.toThrow();
    expect(() => verifyArchiveDigest(archive, undefined)).not.toThrow();
  });

  it('rejects mismatched and malformed digests', () => {
    const archive = temporaryFile('plugin archive');

    expect(() => verifyArchiveDigest(archive, '0'.repeat(64))).toThrow('SHA-256 mismatch');
    expect(() => verifyArchiveDigest(archive, 'not-a-digest')).toThrow('Invalid SHA-256');
  });

  it('requires valid package names only for external manifests', () => {
    const validPlugin = {
      name: 'example',
      packageName: '@example/plugin',
      file: './plugin.tar.gz',
    };

    expect(() => validatePluginSource(validPlugin, true)).not.toThrow();
    expect(() => validatePluginSource({ ...validPlugin, packageName: undefined }, true)).toThrow(
      'must declare a valid package name'
    );
    expect(() =>
      validatePluginSource({ ...validPlugin, packageName: 'invalid package' }, true)
    ).toThrow('must declare a valid package name');
    expect(() => validatePluginSource({ name: 'bundled' }, false)).not.toThrow();
  });

  it.each([undefined, '', '.', '..', '../plugin', 'plugins/example', 'plugins\\example'])(
    'rejects an unsafe external plugin name: %j',
    name => {
      expect(() =>
        validatePluginSource(
          {
            name,
            packageName: 'example-plugin',
            file: './plugin.tar.gz',
          },
          true
        )
      ).toThrow('must declare a safe plugin name');
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
});

describe('plugin archive download', () => {
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
