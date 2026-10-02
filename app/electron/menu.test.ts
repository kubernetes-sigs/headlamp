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

import type { BrowserWindow } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { AppMenu, menusToTemplate } from './menu';

function setup(mainWindow: BrowserWindow | null = null) {
  const actions = {
    openExternal: vi.fn().mockResolvedValue(undefined),
    openAboutDialog: vi.fn(),
    adjustZoom: vi.fn(),
    setZoom: vi.fn(),
  };

  return {
    actions,
    convert: (menus: AppMenu[], loadFullMenu = true) =>
      menusToTemplate(mainWindow, menus, loadFullMenu, actions),
  };
}

describe('menusToTemplate', () => {
  it('keeps regular menu properties and recursively converts submenus', () => {
    const { convert } = setup();

    expect(
      convert([{ id: 'parent', label: 'Parent', submenu: [{ id: 'child', label: 'Child' }] }])
    ).toEqual([{ id: 'parent', label: 'Parent', submenu: [{ id: 'child', label: 'Child' }] }]);
  });

  it('omits afterPlugins items until the full menu is enabled', () => {
    const { convert } = setup();
    const menus = [{ id: 'deferred', afterPlugins: true }];

    expect(convert(menus, false)).toEqual([]);
    expect(convert(menus, true)).toEqual([{ id: 'deferred' }]);
  });

  it('restores the About dialog action', () => {
    const { actions, convert } = setup();
    const [about] = convert([{ id: 'original-about-help' }]);

    about.click?.({} as never, {} as never, {} as never);

    expect(actions.openAboutDialog).toHaveBeenCalledOnce();
  });

  it.each([
    ['original-zoom-in', 0.1],
    ['original-zoom-out', -0.1],
  ])('restores the %s adjustment action', (id, delta) => {
    const { actions, convert } = setup();
    const [zoom] = convert([{ id }]);

    zoom.click?.({} as never, {} as never, {} as never);

    expect(actions.adjustZoom).toHaveBeenCalledWith(delta);
  });

  it('restores the reset zoom action', () => {
    const { actions, convert } = setup();
    const [reset] = convert([{ id: 'original-reset-zoom' }]);

    reset.click?.({} as never, {} as never, {} as never);

    expect(actions.setZoom).toHaveBeenCalledWith(1);
  });

  it('loads internal URLs in the app window', async () => {
    const loadURL = vi.fn().mockResolvedValue(undefined);
    const mainWindow = { webContents: { loadURL } } as unknown as BrowserWindow;
    const { actions, convert } = setup(mainWindow);
    const [internal] = convert([{ id: 'internal', url: 'file:///settings' }]);

    await internal.click?.({} as never, {} as never, {} as never);

    expect(loadURL).toHaveBeenCalledWith('file:///settings');
    expect(actions.openExternal).not.toHaveBeenCalled();
  });

  it('opens HTTP URLs externally even when an app window exists', async () => {
    const loadURL = vi.fn();
    const mainWindow = { webContents: { loadURL } } as unknown as BrowserWindow;
    const { actions, convert } = setup(mainWindow);
    const [external] = convert([{ id: 'external', url: 'https://headlamp.dev' }]);

    await external.click?.({} as never, {} as never, {} as never);

    expect(actions.openExternal).toHaveBeenCalledWith('https://headlamp.dev');
    expect(loadURL).not.toHaveBeenCalled();
  });

  it('opens URLs externally when there is no app window', async () => {
    const { actions, convert } = setup();
    const [external] = convert([{ id: 'external', url: 'headlamp://cluster' }]);

    await external.click?.({} as never, {} as never, {} as never);

    expect(actions.openExternal).toHaveBeenCalledWith('headlamp://cluster');
  });

  it('logs rejected URL actions', async () => {
    const error = new Error('open failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { actions, convert } = setup();
    actions.openExternal.mockRejectedValue(error);
    const [external] = convert([{ id: 'external', url: 'https://headlamp.dev' }]);

    external.click?.({} as never, {} as never, {} as never);

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to open menu URL https://headlamp.dev:',
        error
      );
    });
    consoleError.mockRestore();
  });
});
