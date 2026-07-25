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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTrayIconEnabled, setTrayIconEnabled } from './tray';

function tmpPath(): string {
  return path.join(os.tmpdir(), `tray-test-${Date.now()}-${Math.random()}.json`);
}

describe('tray icon setting', () => {
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

  it('defaults to enabled when the settings file does not exist', () => {
    expect(fs.existsSync(filePath)).toBe(false);
    expect(isTrayIconEnabled(filePath)).toBe(true);
  });

  it('defaults to enabled when the setting is unset but other settings exist', () => {
    fs.writeFileSync(filePath, JSON.stringify({ confirmedCommands: {} }), 'utf-8');
    expect(isTrayIconEnabled(filePath)).toBe(true);
  });

  it('persists and reads back a disabled preference', () => {
    setTrayIconEnabled(false, filePath);
    expect(isTrayIconEnabled(filePath)).toBe(false);
  });

  it('persists and reads back an enabled preference', () => {
    setTrayIconEnabled(false, filePath);
    setTrayIconEnabled(true, filePath);
    expect(isTrayIconEnabled(filePath)).toBe(true);
  });

  it('preserves unrelated settings when toggling', () => {
    fs.writeFileSync(filePath, JSON.stringify({ confirmedCommands: { foo: true } }), 'utf-8');
    setTrayIconEnabled(false, filePath);
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(saved.confirmedCommands).toEqual({ foo: true });
    expect(saved.enableSystemTray).toBe(false);
  });

  it('falls back to enabled when the file contains valid non-object JSON', () => {
    fs.writeFileSync(filePath, JSON.stringify(['not', 'an', 'object']), 'utf-8');
    expect(isTrayIconEnabled(filePath)).toBe(true);
  });

  it('does not throw and writes an object when the file contains non-object JSON', () => {
    fs.writeFileSync(filePath, JSON.stringify('a string'), 'utf-8');
    expect(() => setTrayIconEnabled(false, filePath)).not.toThrow();
    const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(saved).toEqual({ enableSystemTray: false });
  });

  it('swallows write errors so an unwritable settings.json does not crash the main process', () => {
    const unwritable = path.join(os.tmpdir(), `tray-test-${Date.now()}`, 'nope', 'settings.json');
    expect(() => setTrayIconEnabled(false, unwritable)).not.toThrow();
    expect(fs.existsSync(unwritable)).toBe(false);
  });
});
