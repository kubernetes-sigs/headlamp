/*
 * Copyright 2026 The Kubernetes Authors
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

import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const appPath = path.resolve(__dirname, '../..');
const frontendPath = path.resolve(appPath, '../frontend');
const appVersion = JSON.parse(fs.readFileSync(path.join(appPath, 'package.json'), 'utf8')).version;

test('custom product metadata reaches the Electron Builder configuration', () => {
  const manifestDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-product-manifest-'));
  const manifestFile = path.join(manifestDirectory, 'app-build-manifest.json');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      product: {
        name: 'example-desktop',
        productName: 'Example Desktop',
        version: '1.2.3',
        appId: 'io.example.desktop',
        artifactName: 'example-${version}.${ext}',
        protocols: { name: 'example', schemes: ['example'] },
      },
    })
  );

  try {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const { getConfig } = require('app-builder-lib/out/util/config/config'); getConfig(process.cwd(), 'electron-builder.config.ts', {}).then(config => process.stdout.write('HEADLAMP_CONFIG_JSON=' + JSON.stringify(config)));",
      ],
      {
        cwd: appPath,
        encoding: 'utf8',
        env: { ...process.env, HEADLAMP_BUILD_MANIFEST: manifestFile },
      }
    );
    const config = JSON.parse(output.split('HEADLAMP_CONFIG_JSON=')[1]);

    expect(config.appId).toBe('io.example.desktop');
    expect(config.productName).toBe('Example Desktop');
    expect(config.buildVersion).toBe('1.2.3');
    expect(config.artifactName).toBe('example-${version}.${ext}');
    expect(config.protocols).toEqual({ name: 'example', schemes: ['example'] });
    expect(config.extraMetadata).toMatchObject({
      name: 'example-desktop',
      productName: 'Example Desktop',
      version: '1.2.3',
    });
  } finally {
    fs.rmSync(manifestDirectory, { recursive: true, force: true });
  }
});

test('custom product metadata reaches the frontend environment', () => {
  const manifestDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-product-manifest-'));
  const manifestFile = path.join(manifestDirectory, 'app-build-manifest.json');
  const envFile = path.join(manifestDirectory, '.env');
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      product: {
        productName: 'C# $HOME Desktop',
        version: '1.2.3=build',
      },
    })
  );

  try {
    execFileSync(process.execPath, [path.join(frontendPath, 'make-env.js'), envFile], {
      cwd: frontendPath,
      env: {
        ...process.env,
        HEADLAMP_BUILD_MANIFEST: manifestFile,
        HEADLAMP_SOURCE_COMMIT: '0123456789abcdef=source',
      },
    });
    const env = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "import { loadEnv } from 'vite'; process.stdout.write(JSON.stringify(loadEnv('test', process.argv[1], 'REACT_APP_')));",
          manifestDirectory,
        ],
        { cwd: frontendPath, encoding: 'utf8' }
      )
    );

    expect(env).toMatchObject({
      REACT_APP_HEADLAMP_VERSION: appVersion,
      REACT_APP_HEADLAMP_GIT_VERSION: '0123456789abcdef=source',
      REACT_APP_HEADLAMP_PRODUCT_NAME: 'C# $HOME Desktop',
      REACT_APP_HEADLAMP_PRODUCT_VERSION: '1.2.3=build',
    });
  } finally {
    fs.rmSync(manifestDirectory, { recursive: true, force: true });
  }
});
