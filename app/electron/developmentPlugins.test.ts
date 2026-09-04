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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  areDevelopmentPluginsEnabled,
  revokeRunCmdCapabilities,
  setDevelopmentPluginsEnabled,
  showMessageBoxSync,
} = vi.hoisted(() => ({
  areDevelopmentPluginsEnabled: vi.fn(),
  revokeRunCmdCapabilities: vi.fn(),
  setDevelopmentPluginsEnabled: vi.fn(),
  showMessageBoxSync: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: { showMessageBoxSync },
}));

vi.mock('./i18next.config', () => ({
  default: { t: (message: string) => message },
}));

vi.mock('./runCmd', () => ({ revokeRunCmdCapabilities }));

vi.mock('./settings', () => ({
  areDevelopmentPluginsEnabled,
  setDevelopmentPluginsEnabled,
}));

import {
  confirmEnableDevelopmentPlugins,
  setupDevelopmentPluginsHandlers,
} from './developmentPlugins';

describe('confirmEnableDevelopmentPlugins', () => {
  beforeEach(() => {
    showMessageBoxSync.mockReset();
  });

  it('enables only when the native Enable button is selected', () => {
    showMessageBoxSync.mockReturnValueOnce(0);

    expect(confirmEnableDevelopmentPlugins({} as any)).toBe(true);
    expect(showMessageBoxSync).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: 'warning',
        buttons: ['Enable', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      })
    );
  });

  it('stays disabled when confirmation is cancelled', () => {
    showMessageBoxSync.mockReturnValueOnce(1);

    expect(confirmEnableDevelopmentPlugins({} as any)).toBe(false);
  });

  it('fails closed when the native dialog cannot be shown', () => {
    showMessageBoxSync.mockImplementationOnce(() => {
      throw new Error('dialog unavailable');
    });

    expect(confirmEnableDevelopmentPlugins({} as any)).toBe(false);
  });
});

describe('setupDevelopmentPluginsHandlers', () => {
  const handlers = new Map<string, (...args: any[]) => void>();
  const mainFrame = {};
  const webContents = { mainFrame, reload: vi.fn(), send: vi.fn() };
  const mainWindow = { webContents } as any;
  const ipcMain = {
    off: vi.fn((channel: string, handler: (...args: any[]) => void) => {
      if (handlers.get(channel) === handler) {
        handlers.delete(channel);
      }
    }),
    on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
      handlers.set(channel, handler);
    }),
    handle: vi.fn((channel: string, handler: (...args: any[]) => void) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel);
    }),
  } as any;

  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    areDevelopmentPluginsEnabled.mockReturnValue(false);
    setupDevelopmentPluginsHandlers(mainWindow, ipcMain);
  });

  it('rejects state changes from an untrusted frame', () => {
    handlers.get('set-development-plugins')!({ sender: webContents, senderFrame: {} }, true);

    expect(showMessageBoxSync).not.toHaveBeenCalled();
    expect(setDevelopmentPluginsEnabled).not.toHaveBeenCalled();
    expect(revokeRunCmdCapabilities).not.toHaveBeenCalled();
    expect(webContents.reload).not.toHaveBeenCalled();
  });

  it('reports disabled to untrusted frames', () => {
    areDevelopmentPluginsEnabled.mockReturnValue(true);

    expect(handlers.get('get-development-plugins')!({ sender: webContents, senderFrame: {} })).toBe(
      false
    );
    expect(areDevelopmentPluginsEnabled).not.toHaveBeenCalled();
  });

  it('does not disclose the persisted state through the send channel to untrusted frames', () => {
    areDevelopmentPluginsEnabled.mockReturnValue(true);

    handlers.get('request-development-plugins')!({ sender: webContents, senderFrame: {} });

    expect(areDevelopmentPluginsEnabled).not.toHaveBeenCalled();
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it('reports the persisted state to the main frame', () => {
    areDevelopmentPluginsEnabled.mockReturnValue(true);

    expect(
      handlers.get('get-development-plugins')!({ sender: webContents, senderFrame: mainFrame })
    ).toBe(true);
  });

  it('leaves the setting unchanged when native confirmation is cancelled', () => {
    showMessageBoxSync.mockReturnValueOnce(1);

    handlers.get('set-development-plugins')!({ sender: webContents, senderFrame: mainFrame }, true);

    expect(setDevelopmentPluginsEnabled).not.toHaveBeenCalled();
    expect(revokeRunCmdCapabilities).not.toHaveBeenCalled();
    expect(webContents.reload).not.toHaveBeenCalled();
    expect(webContents.send).toHaveBeenCalledWith('development-plugins', false);
  });

  it('persists, revokes capabilities, and reloads after native acceptance', () => {
    showMessageBoxSync.mockReturnValueOnce(0);

    handlers.get('set-development-plugins')!({ sender: webContents, senderFrame: mainFrame }, true);

    expect(setDevelopmentPluginsEnabled).toHaveBeenCalledWith(true);
    expect(revokeRunCmdCapabilities).toHaveBeenCalledWith(ipcMain);
    expect(webContents.reload).toHaveBeenCalledOnce();
    expect(setDevelopmentPluginsEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      revokeRunCmdCapabilities.mock.invocationCallOrder[0]
    );
    expect(revokeRunCmdCapabilities.mock.invocationCallOrder[0]).toBeLessThan(
      webContents.reload.mock.invocationCallOrder[0]
    );
  });

  it('restores the persisted state when saving fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    showMessageBoxSync.mockReturnValueOnce(0);
    setDevelopmentPluginsEnabled.mockImplementationOnce(() => {
      throw new Error('read-only settings');
    });

    handlers.get('set-development-plugins')!({ sender: webContents, senderFrame: mainFrame }, true);

    expect(webContents.send).toHaveBeenCalledWith('development-plugins', false);
    expect(revokeRunCmdCapabilities).not.toHaveBeenCalled();
    expect(webContents.reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to persist Plugin Development Mode:',
      expect.any(Error)
    );
    consoleError.mockRestore();
  });

  it('replaces handlers that target a previous window', () => {
    const previousRequestHandler = handlers.get('request-development-plugins')!;
    const previousSetHandler = handlers.get('set-development-plugins')!;
    const replacementWindow = {
      webContents: { reload: vi.fn(), send: vi.fn() },
    } as any;

    setupDevelopmentPluginsHandlers(replacementWindow, ipcMain);

    expect(ipcMain.off).toHaveBeenCalledWith('request-development-plugins', previousRequestHandler);
    expect(ipcMain.off).toHaveBeenCalledWith('set-development-plugins', previousSetHandler);
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('get-development-plugins');
    handlers.get('request-development-plugins')!({
      sender: replacementWindow.webContents,
      senderFrame: replacementWindow.webContents.mainFrame,
    });
    expect(webContents.send).not.toHaveBeenCalled();
    expect(replacementWindow.webContents.send).toHaveBeenCalledWith('development-plugins', false);
  });
});
