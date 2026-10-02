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

/**
 * Builds a manifest whose product metadata declares the given protocol schemes.
 *
 * @param schemes - Value placed at `product.protocols.schemes`.
 * @returns A build manifest fragment for the scheme lookup.
 */
function manifestWithSchemes(schemes: unknown) {
  return { product: { protocols: { name: 'my-desktop-protocol', schemes } } };
}

describe('getProtocolScheme', () => {
  it('returns a normalized protocol from the packaged product metadata', () => {
    expect(getProtocolScheme(manifestWithSchemes(['My-Desktop']))).toBe('my-desktop');
  });

  it('uses the first scheme when the product registers several', () => {
    expect(getProtocolScheme(manifestWithSchemes(['my-desktop', 'legacy-desktop']))).toBe(
      'my-desktop'
    );
  });

  it.each([undefined, null, {}, { product: null }, { product: { protocols: null } }])(
    'falls back for product metadata without protocols: %j',
    buildManifest => {
      expect(getProtocolScheme(buildManifest)).toBe('headlamp');
    }
  );

  it.each([undefined, null, [], 'my-desktop', [1], [''], [null]])(
    'falls back for an unusable schemes value: %j',
    schemes => {
      expect(getProtocolScheme(manifestWithSchemes(schemes))).toBe('headlamp');
    }
  );

  it('ignores a top-level protocolScheme key that packaging never registers', () => {
    expect(getProtocolScheme({ protocolScheme: 'my-desktop' })).toBe('headlamp');
  });

  it.each(['1desktop', 'not a scheme', 'desktop_app', 'desktop:'])(
    'falls back for an invalid protocol: %s',
    scheme => {
      expect(getProtocolScheme(manifestWithSchemes([scheme]))).toBe('headlamp');
    }
  );

  it.each(['desktop+auth', 'desktop.auth', 'desktop-auth'])(
    'accepts URL scheme punctuation: %s',
    scheme => {
      expect(getProtocolScheme(manifestWithSchemes([scheme]))).toBe(scheme);
    }
  );
});

describe('readProtocolScheme', () => {
  it('reads the protocol from product metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-protocol-'));
    const manifestPath = path.join(directory, 'app-build-manifest.json');

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifestWithSchemes(['Custom-Desktop'])));
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
  it.each(['my-desktop://cluster?name=local', 'MY-DESKTOP://cluster?name=local'])(
    'accepts a URL for the configured protocol: %s',
    value => {
      expect(isProtocolUrl(value, 'my-desktop')).toBe(true);
    }
  );

  it.each([
    'not a URL',
    'headlamp://cluster',
    'https://cluster',
    'my-desktop:cluster',
    'my-desktop://',
  ])('rejects malformed URLs, other protocols, and hostless URLs: %s', value => {
    expect(isProtocolUrl(value, 'my-desktop')).toBe(false);
  });
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
