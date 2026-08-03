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
  DEFAULT_MANIFEST_FILE,
  loadBuildManifest,
  resolveBuildManifestPath,
} = require('../scripts/build-manifest');
const {
  downloadFile,
  validatePluginSource,
  verifyArchiveDigest,
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
          archive: 'https://plugins.example/plugin.tar.gz',
          sha256: '0'.repeat(64),
        },
        true
      )
    ).not.toThrow();
    expect(() =>
      validatePluginSource({ name: 'local', file: './plugin.tar.gz' }, true)
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
