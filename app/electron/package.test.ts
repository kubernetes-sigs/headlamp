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
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
) as {
  name: string;
  productName: string;
  version: string;
  build: {
    artifactName: string;
    linux: {
      executableName?: string;
    };
  };
  optionalDependencies: Record<string, string>;
};
const require = createRequire(import.meta.url);
const { expandMsiArtifactName } = require('../windows/msi/artifact-name.js') as {
  expandMsiArtifactName: (pattern: string, options: Record<string, string>) => string;
};

describe('desktop package configuration', () => {
  it('uses the product name for artifact filenames', () => {
    expect(packageJson.build.artifactName).toBe('${productName}-${version}-${os}-${arch}.${ext}');
  });

  it('expands the product name in Windows MSI filenames', () => {
    expect(
      expandMsiArtifactName(packageJson.build.artifactName, {
        name: packageJson.name,
        productName: packageJson.productName,
        version: packageJson.version,
        os: 'win',
        arch: 'x64',
      })
    ).toBe(`${packageJson.productName}-${packageJson.version}-win-x64.msi`);
  });

  it('derives the Linux executable name from package metadata', () => {
    expect(packageJson.build.linux.executableName).toBeUndefined();
  });
});

describe.runIf(process.platform === 'darwin')('app package', () => {
  it('includes DMG license support for macOS packaging', () => {
    const packageLock = JSON.parse(
      fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')
    );

    expect(packageJson.optionalDependencies).toHaveProperty('dmg-license', expect.any(String));
    expect(packageLock.packages[''].optionalDependencies).toEqual(packageJson.optionalDependencies);
  });
});
