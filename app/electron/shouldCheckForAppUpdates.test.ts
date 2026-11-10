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

/** Writes an application build manifest to a fresh temporary directory. */
function writeManifest(contents: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-update-check-'));
  temporaryDirectories.push(directory);
  const manifestPath = path.join(directory, 'app-build-manifest.json');
  fs.writeFileSync(manifestPath, contents);
  return manifestPath;
}

describe('shouldCheckForAppUpdates', () => {
  it('enables update checks by default', () => {
    expect(shouldCheckForAppUpdates('/path/that/does/not/exist', {})).toBe(true);
  });

  it('uses the environment setting when product metadata is unavailable', () => {
    expect(
      shouldCheckForAppUpdates('/path/that/does/not/exist', { HEADLAMP_CHECK_FOR_UPDATES: 'false' })
    ).toBe(false);
  });

  it('prefers packaged product metadata over the environment', () => {
    const manifestPath = writeManifest(JSON.stringify({ checkForUpdates: false }));

    expect(shouldCheckForAppUpdates(manifestPath, { HEADLAMP_CHECK_FOR_UPDATES: 'true' })).toBe(
      false
    );
  });

  it('enables update checks when product metadata opts in', () => {
    const manifestPath = writeManifest(JSON.stringify({ checkForUpdates: true }));

    expect(shouldCheckForAppUpdates(manifestPath, { HEADLAMP_CHECK_FOR_UPDATES: 'false' })).toBe(
      true
    );
  });

  it('ignores non-boolean product metadata', () => {
    const manifestPath = writeManifest(JSON.stringify({ checkForUpdates: 'false' }));

    expect(shouldCheckForAppUpdates(manifestPath, {})).toBe(true);
  });

  it('ignores a manifest that is not an object', () => {
    const manifestPath = writeManifest(JSON.stringify(null));

    expect(shouldCheckForAppUpdates(manifestPath, { HEADLAMP_CHECK_FOR_UPDATES: 'false' })).toBe(
      false
    );
  });

  it('falls back to the environment when the manifest is invalid', () => {
    const manifestPath = writeManifest('invalid json');

    expect(shouldCheckForAppUpdates(manifestPath, { HEADLAMP_CHECK_FOR_UPDATES: 'false' })).toBe(
      false
    );
  });
});
