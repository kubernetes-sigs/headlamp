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
  /** Dependency lifecycle scripts explicitly approved by npm. */
  allowScripts?: Record<string, boolean>;
  /** Desktop build dependencies keyed by package name. */
  devDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
};
const packageLock = JSON.parse(
  fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')
) as {
  packages: Record<string, { optionalDependencies?: Record<string, string>; resolved?: string }>;
};
const require = createRequire(import.meta.url);
const { expandMsiArtifactName } = require('../windows/msi/artifact-name.js') as {
  expandMsiArtifactName: (pattern: string, options: Record<string, string>) => string;
};

describe('desktop package configuration', () => {
  it('allows only the Electron install script', () => {
    const packageLock = JSON.parse(
      fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')
    );
    const lockedElectron = packageLock.packages['node_modules/electron'];

    expect(packageJson.allowScripts).toEqual({ electron: true });
    expect(lockedElectron.hasInstallScript).toBe(true);
    expect(packageJson.devDependencies.electron).toBe(`^${lockedElectron.version}`);
  });

  it('has the Electron binary installed by its approved script', () => {
    const electronDirectory = new URL('../node_modules/electron/', import.meta.url);
    const electronPackage = JSON.parse(
      fs.readFileSync(new URL('package.json', electronDirectory), 'utf8')
    );
    const executablePath = fs.readFileSync(new URL('path.txt', electronDirectory), 'utf8').trim();

    expect(electronPackage.scripts.postinstall).toBe('node install.js');
    expect(fs.existsSync(new URL(`dist/${executablePath}`, electronDirectory))).toBe(true);
  });

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

  it('does not pin dependencies to private Azure registries', () => {
    const privatePackages = Object.entries(packageLock.packages)
      .filter(([, dependency]) => dependency.resolved?.includes('pkgs.visualstudio.com'))
      .map(([name]) => name);

    expect(privatePackages).toEqual([]);
  });
});

describe.runIf(process.platform === 'darwin')('app package', () => {
  it('includes DMG license support for macOS packaging', () => {
    expect(packageJson.optionalDependencies).toHaveProperty('dmg-license', expect.any(String));
    expect(packageLock.packages[''].optionalDependencies).toEqual(packageJson.optionalDependencies);
  });
});
