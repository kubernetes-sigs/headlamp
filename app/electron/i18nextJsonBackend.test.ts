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
import { createJsonBackend } from './i18nextJsonBackend';

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('createJsonBackend', () => {
  it('loads JSON locale resources', async () => {
    const localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-i18n-'));
    tempDirs.push(localesDir);
    fs.mkdirSync(path.join(localesDir, 'en'));
    fs.writeFileSync(path.join(localesDir, 'en', 'app.json'), '{"Hello":"World"}');

    const backend = createJsonBackend(localesDir);
    const resource = await new Promise((resolve, reject) => {
      backend.read('en', 'app', (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    });

    expect(resource).toEqual({ Hello: 'World' });
  });

  it('reports invalid JSON', async () => {
    const localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-i18n-'));
    tempDirs.push(localesDir);
    fs.mkdirSync(path.join(localesDir, 'en'));
    fs.writeFileSync(path.join(localesDir, 'en', 'app.json'), '{');

    const backend = createJsonBackend(localesDir);
    await expect(
      new Promise((resolve, reject) => {
        backend.read('en', 'app', (error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      })
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it('reports missing locale resources', async () => {
    const localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-i18n-'));
    tempDirs.push(localesDir);
    const backend = createJsonBackend(localesDir);

    await expect(
      new Promise((resolve, reject) => {
        backend.read('en', 'missing', (error, data) => {
          if (error) {
            reject(error);
          } else {
            resolve(data);
          }
        });
      })
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
