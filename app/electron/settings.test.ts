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
import path from 'path';
import { loadSettings, saveSettings } from './settings';

function tmpPath(): string {
  return path.join(os.tmpdir(), `settings-test-${Date.now()}-${Math.random()}.json`);
}

describe('settings load/save', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpPath();
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  });

  it('loadSettings returns {} when file does not exist', () => {
    expect(fs.existsSync(filePath)).toBe(false);
    const res = loadSettings(filePath);
    expect(res).toEqual({});
  });

  it('saveSettings writes JSON and loadSettings reads it back', () => {
    const obj = { a: 1, b: 'two', nested: { ok: true } };
    saveSettings(filePath, obj);
    expect(fs.existsSync(filePath)).toBe(true);

    const raw = fs.readFileSync(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify(obj));

    const loaded = loadSettings(filePath);
    expect(loaded).toEqual(obj);
  });

  it('loadSettings returns {} for invalid JSON content', () => {
    fs.writeFileSync(filePath, 'not-a-json', 'utf-8');
    const res = loadSettings(filePath);
    expect(res).toEqual({});
  });

  it('loadSettings returns {} when reading a directory path (read error)', () => {
    // point to a directory to force read error
    const dirPath = os.tmpdir();
    const res = loadSettings(dirPath);
    expect(res).toEqual({});
  });
});
