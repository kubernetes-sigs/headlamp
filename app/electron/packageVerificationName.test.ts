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
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { derivePackageVerificationName } = require('../scripts/package-verification-name.ts');
const currentPackageMetadata = require('../package.json');

describe('derivePackageVerificationName', () => {
  const packageMetadata = {
    name: '@headlamp-k8s/headlamp',
    productName: 'Headlamp Product',
    build: {
      executableName: 'global/name',
      productName: 'Build Product',
      linux: { executableName: 'linux/name' },
      mac: { executableName: 'mac/name' },
      win: { executableName: 'windows/name' },
    },
  };

  it.each([
    ['linux', 'linuxname'],
    ['mac', 'macname'],
    ['win', 'windowsname.exe'],
  ])('uses the %s platform executable name', (platform, expected) => {
    expect(derivePackageVerificationName(packageMetadata, platform)).toBe(expected);
  });

  it.each([
    ['linux', 'globalname'],
    ['mac', 'globalname'],
    ['win', 'globalname.exe'],
  ])('falls back to the global executable name for %s', (platform, expected) => {
    const metadata = {
      ...packageMetadata,
      build: { ...packageMetadata.build, [platform]: undefined },
    };

    expect(derivePackageVerificationName(metadata, platform)).toBe(expected);
  });

  it('uses a lowercase package name for the default Linux executable', () => {
    expect(
      derivePackageVerificationName({ name: '@Headlamp-K8s/Headlamp', build: {} }, 'linux')
    ).toBe('@headlamp-k8sheadlamp');
  });

  it.each([
    [{ name: 'package', build: { productName: 'Build/Product' } }, 'BuildProduct'],
    [{ name: 'package', productName: 'Package/Product' }, 'PackageProduct'],
    [{ name: 'Package/Name' }, 'PackageName'],
  ])('uses product metadata for macOS', (metadata, expected) => {
    expect(derivePackageVerificationName(metadata, 'mac')).toBe(expected);
  });

  it('adds the executable suffix to the Windows product name fallback', () => {
    expect(derivePackageVerificationName({ name: 'Headlamp' }, 'win')).toBe('Headlamp.exe');
  });

  it.each(['linux', 'mac', 'win'])('rejects an empty %s executable name', platform => {
    const metadata = {
      name: 'Headlamp',
      build: { [platform]: { executableName: '' } },
    };

    expect(derivePackageVerificationName(metadata, platform)).toBe('');
  });

  it.each([
    ['linux', 'headlamp'],
    ['mac', 'Headlamp'],
    ['win', 'Headlamp.exe'],
  ])('derives the current package verification name for %s', (platform, expected) => {
    expect(derivePackageVerificationName(currentPackageMetadata, platform)).toBe(expected);
  });
});
