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
import { afterEach, describe, expect, it } from 'vitest';
import { shouldCheckForAppUpdates } from './shouldCheckForAppUpdates';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('shouldCheckForAppUpdates', () => {
  it('enables update checks by default', () => {
    expect(shouldCheckForAppUpdates({}, '/path/that/does/not/exist')).toBe(true);
  });

  it('uses the environment setting when product metadata is unavailable', () => {
    expect(
      shouldCheckForAppUpdates({ HEADLAMP_CHECK_FOR_UPDATES: 'false' }, '/path/that/does/not/exist')
    ).toBe(false);
  });

  it('prefers packaged product metadata over the environment', () => {
    const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-update-check-'));
    temporaryDirectories.push(resourcesPath);
    fs.writeFileSync(
      path.join(resourcesPath, 'app-build-manifest.json'),
      JSON.stringify({ checkForUpdates: false })
    );

    expect(shouldCheckForAppUpdates({ HEADLAMP_CHECK_FOR_UPDATES: 'true' }, resourcesPath)).toBe(
      false
    );
  });

  it('ignores non-boolean product metadata', () => {
    const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-update-check-'));
    temporaryDirectories.push(resourcesPath);
    fs.writeFileSync(
      path.join(resourcesPath, 'app-build-manifest.json'),
      JSON.stringify({ checkForUpdates: 'false' })
    );

    expect(shouldCheckForAppUpdates({}, resourcesPath)).toBe(true);
  });

  it('reads product metadata from the development directory', () => {
    const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-update-check-'));
    const developmentPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-update-check-dev-'));
    temporaryDirectories.push(resourcesPath, developmentPath);
    fs.writeFileSync(
      path.join(resourcesPath, 'app-build-manifest.json'),
      JSON.stringify({ checkForUpdates: true })
    );
    fs.writeFileSync(
      path.join(developmentPath, 'app-build-manifest.json'),
      JSON.stringify({ checkForUpdates: false })
    );

    expect(shouldCheckForAppUpdates({ ELECTRON_DEV: 'true' }, resourcesPath, developmentPath)).toBe(
      false
    );
  });

  it('falls back to the environment when the manifest is invalid', () => {
    const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-update-check-'));
    temporaryDirectories.push(resourcesPath);
    fs.writeFileSync(path.join(resourcesPath, 'app-build-manifest.json'), 'invalid json');

    expect(shouldCheckForAppUpdates({ HEADLAMP_CHECK_FOR_UPDATES: 'false' }, resourcesPath)).toBe(
      false
    );
  });
});
