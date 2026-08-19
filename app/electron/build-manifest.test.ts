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

import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { applyPlatformMetadata } = require('../scripts/build-manifest');
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
