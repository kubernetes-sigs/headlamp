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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupHeadlampTray,
  createHeadlampTray,
  getClusterStatuses,
  isTrayIconEnabled,
  resolveTrayIconPath,
  setTrayIconEnabled,
} from './tray';

const electronMocks = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn(() => false),
    resize: vi.fn(),
    setTemplateImage: vi.fn(),
  };
  image.resize.mockReturnValue(image);
  const tray = {
    destroy: vi.fn(),
    isDestroyed: vi.fn(() => false),
    setContextMenu: vi.fn(),
    setToolTip: vi.fn(),
  };
  return {
    buildFromTemplate: vi.fn(() => ({})),
    createFromPath: vi.fn(() => image),
    image,
    tray,
    Tray: vi.fn(function () {
      return tray;
    }),
  };
});

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp'), name: 'Headlamp' },
  BrowserWindow: vi.fn(),
  Menu: { buildFromTemplate: electronMocks.buildFromTemplate },
  nativeImage: { createFromPath: electronMocks.createFromPath },
  Tray: electronMocks.Tray,
}));

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

describe('tray icon path', () => {
  let resourcesPath: string;
  let outsideIconPath: string;

  beforeEach(() => {
    resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tray-resources-'));
    fs.mkdirSync(path.join(resourcesPath, 'assets'));
    fs.writeFileSync(path.join(resourcesPath, 'assets', 'example-tray.png'), 'icon');
    outsideIconPath = path.join(path.dirname(resourcesPath), 'outside.png');
    fs.writeFileSync(outsideIconPath, 'outside');
  });

  afterEach(() => {
    fs.rmSync(resourcesPath, { force: true, recursive: true });
    fs.rmSync(outsideIconPath, { force: true });
    vi.restoreAllMocks();
  });

  it('uses a product icon from packaged resources', () => {
    expect(
      resolveTrayIconPath({ isDev: false, trayIcon: 'assets/example-tray.png' }, resourcesPath)
    ).toEqual({
      path: fs.realpathSync(path.join(resourcesPath, 'assets', 'example-tray.png')),
      isCustom: true,
    });
  });

  it('rejects product icons outside packaged resources', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(
      resolveTrayIconPath({ isDev: false, trayIcon: '../outside.png' }, resourcesPath)
    ).toEqual({
      path: path.join(
        resourcesPath,
        'assets',
        process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon.png'
      ),
      isCustom: false,
    });
    expect(consoleError).toHaveBeenCalledWith(
      'Ignoring tray icon outside packaged resources: "../outside.png"'
    );
  });

  it('falls back when a product icon is unavailable', () => {
    expect(
      resolveTrayIconPath({ isDev: false, trayIcon: 'assets/missing.png' }, resourcesPath)
    ).toMatchObject({ isCustom: false });
  });

  it.runIf(process.platform !== 'win32')('rejects symlinks outside packaged resources', () => {
    fs.symlinkSync(outsideIconPath, path.join(resourcesPath, 'assets', 'linked.png'));

    expect(
      resolveTrayIconPath({ isDev: false, trayIcon: 'assets/linked.png' }, resourcesPath)
    ).toMatchObject({ isCustom: false });
  });
});

describe('tray icon creation', () => {
  const options = {
    backendToken: 'token',
    createWindow: vi.fn(),
    getBackendPort: () => 4466,
    getMainWindow: () => null,
    isBackendAvailable: () => true,
    isDev: false,
    quit: vi.fn(),
  };

  beforeEach(() => {
    electronMocks.createFromPath.mockReset();
    electronMocks.createFromPath.mockReturnValue(electronMocks.image);
    electronMocks.image.isEmpty.mockReset();
    electronMocks.image.isEmpty.mockReturnValue(false);
    electronMocks.image.resize.mockReset();
    electronMocks.image.resize.mockReturnValue(electronMocks.image);
  });

  afterEach(() => cleanupHeadlampTray());

  it('resizes an accepted custom macOS icon', () => {
    const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tray-create-'));
    fs.writeFileSync(path.join(resourcesPath, 'custom.png'), 'icon');
    vi.stubGlobal('process', { ...process, platform: 'darwin', resourcesPath });

    expect(createHeadlampTray({ ...options, trayIcon: 'custom.png' })).toBe(true);
    expect(electronMocks.image.resize).toHaveBeenCalledWith({ width: 22, height: 22 });

    vi.unstubAllGlobals();
    fs.rmSync(resourcesPath, { force: true, recursive: true });
  });

  it('uses the default icon when a custom image cannot be decoded', () => {
    const resourcesPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tray-create-'));
    fs.writeFileSync(path.join(resourcesPath, 'custom.png'), 'invalid icon');
    vi.stubGlobal('process', { ...process, resourcesPath });
    electronMocks.image.isEmpty.mockReturnValueOnce(true).mockReturnValue(false);

    expect(createHeadlampTray({ ...options, trayIcon: 'custom.png' })).toBe(true);
    expect(electronMocks.createFromPath).toHaveBeenCalledTimes(2);
    expect(electronMocks.image.resize).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    fs.rmSync(resourcesPath, { force: true, recursive: true });
  });
});

describe('tray cluster status requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the backend token header for config and cluster health requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ clusters: [{ name: 'test-cluster' }] }),
      })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await getClusterStatuses({
      backendToken: 'desktop-token',
      createWindow: vi.fn(),
      getBackendPort: () => 4466,
      getMainWindow: () => null,
      isBackendAvailable: () => true,
      isDev: true,
      quit: vi.fn(),
    });

    const expectedHeaders = { 'X-HEADLAMP_BACKEND-TOKEN': 'desktop-token' };
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:4466/config', {
      headers: expectedHeaders,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:4466/clusters/test-cluster/healthz',
      { headers: expectedHeaders }
    );
  });

  it('does not send the backend token after backend ownership is lost', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await getClusterStatuses({
      backendToken: 'desktop-token',
      createWindow: vi.fn(),
      getBackendPort: () => 4466,
      getMainWindow: () => null,
      isBackendAvailable: () => false,
      isDev: true,
      quit: vi.fn(),
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops authenticated health requests when ownership is lost during a poll', async () => {
    let backendAvailable = true;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => {
        backendAvailable = false;
        return { clusters: [{ name: 'test-cluster' }] };
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const statuses = await getClusterStatuses({
      backendToken: 'desktop-token',
      createWindow: vi.fn(),
      getBackendPort: () => 4466,
      getMainWindow: () => null,
      isBackendAvailable: () => backendAvailable,
      isDev: true,
      quit: vi.fn(),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(statuses).toEqual([{ name: 'test-cluster', status: 'unknown' }]);
  });
});
