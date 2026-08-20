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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProtocolUrl, getProtocolScheme, isProtocolUrl, readProtocolScheme } from './protocol';

describe('getProtocolScheme', () => {
  it('returns a normalized protocol persisted in product metadata', () => {
    expect(getProtocolScheme({ protocolScheme: 'My-Desktop' })).toBe('my-desktop');
  });

  it.each([undefined, null, {}, { protocolScheme: 1 }, { protocolScheme: '' }])(
    'falls back for product metadata without a valid protocol: %j',
    buildManifest => {
      expect(getProtocolScheme(buildManifest)).toBe('headlamp');
    }
  );

  it.each(['1desktop', 'not a scheme', 'desktop_app', 'desktop:'])(
    'falls back for an invalid protocol: %s',
    protocolScheme => {
      expect(getProtocolScheme({ protocolScheme })).toBe('headlamp');
    }
  );

  it.each(['desktop+auth', 'desktop.auth', 'desktop-auth'])(
    'accepts URL scheme punctuation: %s',
    protocolScheme => {
      expect(getProtocolScheme({ protocolScheme })).toBe(protocolScheme);
    }
  );
});

describe('readProtocolScheme', () => {
  it('reads the protocol from product metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-protocol-'));
    const manifestPath = path.join(directory, 'app-build-manifest.json');

    try {
      fs.writeFileSync(manifestPath, JSON.stringify({ protocolScheme: 'Custom-Desktop' }));
      expect(readProtocolScheme(manifestPath)).toBe('custom-desktop');
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  });

  it('falls back when product metadata does not exist', () => {
    expect(readProtocolScheme('/path/that/does/not/exist')).toBe('headlamp');
  });

  it('falls back when product metadata is not valid JSON', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-protocol-invalid-'));
    const manifestPath = path.join(directory, 'app-build-manifest.json');

    try {
      fs.writeFileSync(manifestPath, '{');
      expect(readProtocolScheme(manifestPath)).toBe('headlamp');
    } finally {
      fs.rmSync(directory, { force: true, recursive: true });
    }
  });
});

describe('isProtocolUrl', () => {
  it.each([
    'my-desktop://cluster?name=local',
    'MY-DESKTOP://cluster?name=local',
    'my-desktop:cluster',
  ])('accepts a URL for the configured protocol: %s', value => {
    expect(isProtocolUrl(value, 'my-desktop')).toBe(true);
  });

  it.each(['not a URL', 'headlamp://cluster', 'https://cluster'])(
    'rejects malformed URLs and other protocols: %s',
    value => {
      expect(isProtocolUrl(value, 'my-desktop')).toBe(false);
    }
  );
});

describe('findProtocolUrl', () => {
  it('finds a configured protocol URL among process arguments', () => {
    expect(
      findProtocolUrl(['electron', '.', '--flag', 'my-desktop://cluster?name=local'], 'my-desktop')
    ).toBe('my-desktop://cluster?name=local');
  });

  it('ignores malformed URLs and URLs for other protocols', () => {
    expect(
      findProtocolUrl(['electron', '.', 'not a URL', 'headlamp://cluster'], 'my-desktop')
    ).toBeUndefined();
  });
});
