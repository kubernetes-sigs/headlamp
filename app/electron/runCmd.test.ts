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

import { EventEmitter } from 'events';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

const { getShellEnvironmentMock, spawnMock, showMessageBoxSyncMock } = vi.hoisted(() => ({
  getShellEnvironmentMock: vi.fn(),
  spawnMock: vi.fn(),
  showMessageBoxSyncMock: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showMessageBoxSync: showMessageBoxSyncMock },
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('./plugin-management', () => ({
  defaultPluginsDir: vi.fn(() => '/plugins/default'),
  defaultUserPluginsDir: vi.fn(() => '/plugins/user'),
}));

vi.mock('./settings', () => ({
  loadSettings: vi.fn(() => ({
    confirmedCommands: { 'minikube start': true, 'gh auth': true, 'az account': true },
  })),
  saveSettings: vi.fn(),
  SETTINGS_PATH: '/fake/settings.json',
}));

vi.mock('./i18next.config', () => ({
  default: { t: (s: string) => s },
}));

const shellEnvironment = { PATH: '/opt/homebrew/bin:/usr/bin', SHELL: '/bin/zsh' };

vi.mock('./main', () => ({
  getShellEnvironment: getShellEnvironmentMock,
}));

import {
  addRunCmdConsent,
  checkPermissionSecret,
  environmentOverrides,
  handleRunCommand,
  removeRunCmdConsent,
  setupRunCmdHandlers,
  validateCommandData,
} from './runCmd';

it('does not cache process environment changes as shell overrides', () => {
  expect(
    environmentOverrides(
      { PATH: '/opt/homebrew/bin:/usr/bin', HEADLAMP_CONFIG_ENABLE_HELM: 'true' },
      { PATH: '/usr/bin', HEADLAMP_CONFIG_ENABLE_HELM: 'true' }
    )
  ).toEqual({ PATH: '/opt/homebrew/bin:/usr/bin' });
});

it('uses process.env as the default comparison environment', () => {
  expect(environmentOverrides(process.env)).toEqual({});
});

describe('checkPermissionSecret', () => {
  const baseCommandData = {
    id: '1',
    command: 'minikube',
    args: [],
    options: {},
    permissionSecrets: {},
  };

  it('returns true when permission secret matches for minikube', () => {
    const permissionSecrets = { 'runCmd-minikube': 123 };
    const commandData = {
      ...baseCommandData,
      permissionSecrets: { 'runCmd-minikube': 123 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(true);
  });

  it('returns false when permission secret is missing', () => {
    const permissionSecrets = {};
    const commandData = {
      ...baseCommandData,
      permissionSecrets: {},
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  it('returns false when permission secret does not match', () => {
    const permissionSecrets = { 'runCmd-minikube': 123 };
    const commandData = {
      ...baseCommandData,
      permissionSecrets: { 'runCmd-minikube': 456 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  it('returns true for scriptjs with correct permission secret', () => {
    const permissionSecrets = { 'runCmd-scriptjs-myscript.js': 42 };
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['myscript.js'],
      permissionSecrets: { 'runCmd-scriptjs-myscript.js': 42 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(true);
  });

  it('returns false for scriptjs with missing permission secret', () => {
    const permissionSecrets = {};
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['myscript.js'],
      permissionSecrets: {},
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  it('returns false for scriptjs with mismatched permission secret', () => {
    const permissionSecrets = { 'runCmd-scriptjs-myscript.js': 42 };
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['myscript.js'],
      permissionSecrets: { 'runCmd-scriptjs-myscript.js': 99 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(false);
  });

  // it works for windows paths in like plugins\minikube/myscript.js
  it('handles Windows paths in scriptjs command', () => {
    const permissionSecrets = { 'runCmd-scriptjs-plugins/minikube/myscript.js': 42 };
    const commandData = {
      ...baseCommandData,
      command: 'scriptjs',
      args: ['plugins\\minikube/myscript.js'],
      permissionSecrets: { 'runCmd-scriptjs-plugins/minikube/myscript.js': 42 },
    };
    expect(checkPermissionSecret(commandData, permissionSecrets)[0]).toBe(true);
  });
});

describe('validateCommandData', () => {
  it('returns false if eventData is not an object', () => {
    expect(validateCommandData(null as any)[0]).toBe(false);
    expect(validateCommandData(undefined as any)[0]).toBe(false);
    expect(validateCommandData('string' as any)[0]).toBe(false);
  });

  it('returns false if id is missing, empty, or not a string', () => {
    expect(validateCommandData({ command: 'gh', args: [], options: {} })[0]).toBe(false);
    expect(validateCommandData({ id: '', command: 'gh', args: [], options: {} })[0]).toBe(false);
    expect(validateCommandData({ id: 1 as any, command: 'gh', args: [], options: {} })[0]).toBe(
      false
    );
  });

  it('returns false if command is missing or not a string', () => {
    expect(validateCommandData({ args: [], options: {}, permissionSecrets: {} })[0]).toBe(false);
    expect(
      validateCommandData({ command: 123 as any, args: [], options: {}, permissionSecrets: {} })[0]
    ).toBe(false);
    expect(
      validateCommandData({ command: '', args: [], options: {}, permissionSecrets: {} })[0]
    ).toBe(false);
  });

  it('returns false if args is not an array', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: 'not-array' as any,
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(false);
  });

  it('returns false if options is not an object', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: null as any,
        permissionSecrets: {},
      })[0]
    ).toBe(false);
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: 123 as any,
        permissionSecrets: {},
      })[0]
    ).toBe(false);
  });

  it('returns false if permissionSecrets is not an object', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: null as any,
      })[0]
    ).toBe(false);
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: 123 as any,
      })[0]
    ).toBe(false);
  });

  it('returns false if any permissionSecret value is not a number', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: { foo: undefined as any },
      })[0]
    ).toBe(false);
  });

  it('returns false if command is not in validCommands', () => {
    expect(
      validateCommandData({
        command: 'invalidcmd',
        args: [],
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(false);
  });

  it('returns true for valid minikube command', () => {
    expect(
      validateCommandData({
        id: 'test-id',
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: { 'runCmd-minikube': 123 },
      })[0]
    ).toBe(true);
  });

  it('returns true for valid az command', () => {
    expect(
      validateCommandData({
        id: 'test-id',
        command: 'az',
        args: ['arg1'],
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(true);
  });

  it('returns true for valid scriptjs command', () => {
    expect(
      validateCommandData({
        id: 'test-id',
        command: 'scriptjs',
        args: ['myscript.js'],
        options: {},
        permissionSecrets: { 'runCmd-scriptjs-myscript.js': 42 },
      })[0]
    ).toBe(true);
  });
});

describe('handleRunCommand', () => {
  let childEmitter: any;
  let fakeEvent: any;
  let sentMessages: Array<[string, ...unknown[]]>;

  beforeEach(() => {
    getShellEnvironmentMock.mockReset();
    getShellEnvironmentMock.mockResolvedValue(shellEnvironment);
    spawnMock.mockReset();
    childEmitter = new EventEmitter();
    childEmitter.stdout = new EventEmitter();
    childEmitter.stderr = new EventEmitter();
    spawnMock.mockReturnValue(childEmitter);
    sentMessages = [];
    fakeEvent = {
      sender: {
        send: vi.fn((...args: [string, ...unknown[]]) => sentMessages.push(args)),
      },
    } as any;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs gh with the login-shell environment and reports child errors', async () => {
    const fakeMainWindow = { id: 1 } as any;
    const permissionSecrets = { 'runCmd-gh': 99 };

    const eventData = {
      id: 'test-id',
      command: 'gh',
      args: ['auth', 'token'],
      options: {},
      permissionSecrets: { 'runCmd-gh': 99 },
    };

    await handleRunCommand(fakeEvent, eventData, fakeMainWindow, permissionSecrets);

    expect(spawnMock).toHaveBeenCalledWith(
      'gh',
      ['auth', 'token'],
      expect.objectContaining({ env: shellEnvironment })
    );

    const err = new Error('spawn error');
    childEmitter.emit('error', err);

    expect(sentMessages).toContainEqual(['command-stderr', 'test-id', 'spawn error']);
    expect(sentMessages).toContainEqual(['command-exit', 'test-id', -1]);

    childEmitter.emit('close', null);
    expect(sentMessages.filter(([channel]) => channel === 'command-exit')).toHaveLength(1);
  });

  it('reports exit only after stdout and stderr close', async () => {
    const eventData = {
      id: 'test-id',
      command: 'gh',
      args: ['auth', 'token'],
      options: {},
      permissionSecrets: { 'runCmd-gh': 99 },
    };

    await handleRunCommand(fakeEvent, eventData, { id: 1 } as any, { 'runCmd-gh': 99 });

    childEmitter.emit('exit', 0);
    childEmitter.stdout.emit('data', 'final output');
    childEmitter.stderr.emit('data', 'final warning');

    expect(sentMessages).toEqual([
      ['command-stdout', 'test-id', 'final output'],
      ['command-stderr', 'test-id', 'final warning'],
    ]);

    childEmitter.emit('close', 0);
    expect(sentMessages.at(-1)).toEqual(['command-exit', 'test-id', 0]);
  });

  it.each([
    ['missing window', { id: 'test-id' }, null, { 'runCmd-gh': 99 }, -1],
    [
      'invalid command data',
      { id: 'test-id', command: 'invalid', args: [], options: {}, permissionSecrets: {} },
      { id: 1 },
      {},
      -1,
    ],
    [
      'invalid permission secret',
      {
        id: 'test-id',
        command: 'gh',
        args: ['auth', 'token'],
        options: {},
        permissionSecrets: { 'runCmd-gh': 1 },
      },
      { id: 1 },
      { 'runCmd-gh': 99 },
      -2,
    ],
  ])('reports a rejected exit for %s', async (_name, data, window, secrets, exitCode) => {
    await handleRunCommand(fakeEvent, data as any, window as any, secrets);

    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'test-id', exitCode]]);
  });

  it('reports a rejected exit when command consent was denied previously', async () => {
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { 'gh auth': false } });
    const eventData = {
      id: 'test-id',
      command: 'gh',
      args: ['auth', 'token'],
      options: {},
      permissionSecrets: { 'runCmd-gh': 99 },
    };

    await handleRunCommand(fakeEvent, eventData, { id: 1 } as any, { 'runCmd-gh': 99 });

    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'test-id', -3]]);
  });

  it('reports synchronous spawn errors without rejecting', async () => {
    spawnMock.mockImplementation(() => {
      throw new Error('spawn failed');
    });
    const eventData = {
      id: 'test-id',
      command: 'gh',
      args: ['auth', 'token'],
      options: {},
      permissionSecrets: { 'runCmd-gh': 99 },
    };

    await expect(
      handleRunCommand(fakeEvent, eventData, { id: 1 } as any, { 'runCmd-gh': 99 })
    ).resolves.toBeUndefined();

    expect(sentMessages).toContainEqual(['command-stderr', 'test-id', 'spawn failed']);
    expect(sentMessages).toContainEqual(['command-exit', 'test-id', -1]);
  });

  it('falls back to process.env when shell environment resolution fails', async () => {
    getShellEnvironmentMock.mockRejectedValue(new Error('shell unavailable'));
    vi.stubEnv('HEADLAMP_TEST_ENV', 'current');
    const eventData = {
      id: 'test-id',
      command: 'gh',
      args: ['auth', 'token'],
      options: {},
      permissionSecrets: { 'runCmd-gh': 99 },
    };

    await expect(
      handleRunCommand(fakeEvent, eventData, { id: 1 } as any, { 'runCmd-gh': 99 })
    ).resolves.toBeUndefined();
    expect(spawnMock).toHaveBeenCalledWith(
      'gh',
      ['auth', 'token'],
      expect.objectContaining({
        env: expect.objectContaining({ HEADLAMP_TEST_ENV: 'current' }),
      })
    );
  });

  it('runs plugin scripts with the Electron executable', async () => {
    const { loadSettings } = await import('./settings');
    const originalResourcesPath = process.resourcesPath;
    // @ts-ignore Electron defines this at runtime.
    process.resourcesPath = '/resources';
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: { 'scriptjs missing-plugin/script.js': true },
    });
    const eventData = {
      id: 'script-id',
      command: 'scriptjs',
      args: ['missing-plugin/script.js', '--flag'],
      options: {},
      permissionSecrets: { 'runCmd-scriptjs-missing-plugin/script.js': 99 },
    };

    try {
      await handleRunCommand(fakeEvent, eventData, { id: 1 } as any, {
        'runCmd-scriptjs-missing-plugin/script.js': 99,
      });

      expect(spawnMock).toHaveBeenCalledWith(
        process.execPath,
        [path.join('/plugins/default', 'missing-plugin/script.js'), '--flag'],
        expect.objectContaining({
          env: expect.objectContaining({ HEADLAMP_RUN_SCRIPT: 'true' }),
        })
      );
    } finally {
      // @ts-ignore Electron defines this at runtime.
      process.resourcesPath = originalResourcesPath;
    }
  });

  it('initializes consent settings for a new command', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({});
    vi.mocked(saveSettings).mockClear();
    showMessageBoxSyncMock.mockReturnValueOnce(0);
    const eventData = {
      id: 'consent-id',
      command: 'minikube',
      args: [],
      options: {},
      permissionSecrets: { 'runCmd-minikube': 99 },
    };

    await handleRunCommand(fakeEvent, eventData, { id: 1 } as any, {
      'runCmd-minikube': 99,
    });

    expect(saveSettings).toHaveBeenCalledWith(
      '/fake/settings.json',
      expect.objectContaining({ confirmedCommands: { minikube: true } })
    );
    expect(spawnMock).toHaveBeenCalled();
  });
});

describe('runScript', () => {
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalConsoleError = console.error;
  const originalResourcesPath = process.resourcesPath;

  let exitMock: Mock;
  let consoleErrorMock: Mock;
  beforeEach(() => {
    vi.resetModules();
    // @ts-ignore this is fine for tests
    process.resourcesPath = '/resources';

    exitMock = vi.fn() as any;
    // @ts-expect-error overriding for test
    process.exit = exitMock;
    consoleErrorMock = vi.fn();
    console.error = consoleErrorMock;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    console.error = originalConsoleError;
    // @ts-ignore
    process.resourcesPath = originalResourcesPath;
    vi.restoreAllMocks();
  });

  const testScriptImport = async (scriptPath: string) => {
    const resolvedPath = path.resolve(scriptPath);
    process.argv = ['node', resolvedPath];
    vi.doMock(resolvedPath, () => ({}));
    const runCmdModule = await import('./runCmd');
    runCmdModule.runScript();
    expect(exitMock).not.toHaveBeenCalled();
  };

  it('imports the script when path is inside defaultPluginsDir', () =>
    testScriptImport('/plugins/default/my-script.js'));

  it('imports the script when path is inside defaultUserPluginsDir', () =>
    testScriptImport('/plugins/user/my-script.js'));

  it('imports the script when path is inside static .plugins dir', () =>
    testScriptImport('/resources/.plugins/my-script.js'));

  it('exits with error when script is outside allowed directories', async () => {
    const scriptPath = path.resolve('/not-allowed/my-script.js');
    process.argv = ['node', scriptPath];
    vi.doMock(scriptPath, () => ({}));

    const runCmdModule = await import('./runCmd');
    runCmdModule.runScript();

    expect(consoleErrorMock).toHaveBeenCalledTimes(1);
    expect(exitMock).toHaveBeenCalledWith(1);
  });
});

describe('addRunCmdConsent', () => {
  const AI_ASSISTANT_COMMANDS = ['gh auth', 'az account', 'az cognitiveservices'];

  it.each([
    ['headlamp_ai-assistant'],
    ['headlamp_ai_assistant'],
    ['headlamp_ai-assistantprerelease'],
    ['headlamp_ai_assistantprerelease'],
  ])('pre-populates AI assistant commands for plugin name "%s"', async pluginName => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: {} });
    vi.mocked(saveSettings).mockClear();

    addRunCmdConsent({ name: pluginName });

    expect(saveSettings).toHaveBeenCalledTimes(1);
    const savedSettings = vi.mocked(saveSettings).mock.calls[0][1] as any;
    for (const cmd of AI_ASSISTANT_COMMANDS) {
      expect(savedSettings.confirmedCommands[cmd]).toBe(true);
    }
  });

  it('pre-populates the Azure AKS script command', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: {} });
    vi.mocked(saveSettings).mockClear();

    addRunCmdConsent({ name: 'azure-aks' });

    expect(saveSettings).toHaveBeenCalledWith(
      '/fake/settings.json',
      expect.objectContaining({
        confirmedCommands: {
          'scriptjs azure-aks/azure-api.js': true,
        },
      })
    );
  });

  it('does not pre-populate AI assistant commands for an unrecognised plugin name', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: {} });
    vi.mocked(saveSettings).mockClear();

    addRunCmdConsent({ name: 'some-other-plugin' });

    const savedSettings = vi.mocked(saveSettings).mock.calls[0]?.[1] as any;
    for (const cmd of AI_ASSISTANT_COMMANDS) {
      expect(savedSettings?.confirmedCommands?.[cmd]).toBeUndefined();
    }
  });

  it('initializes consent settings and pre-populates minikube commands', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({});
    vi.mocked(saveSettings).mockClear();

    addRunCmdConsent({ name: 'headlamp_minikube' });

    const savedSettings = vi.mocked(saveSettings).mock.calls[0][1] as any;
    expect(savedSettings.confirmedCommands['minikube status']).toBe(true);
  });

  it('recognizes the development minikube plugin name', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.stubEnv('NODE_ENV', 'development');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: {} });
    vi.mocked(saveSettings).mockClear();

    addRunCmdConsent({ name: 'minikube' });

    const savedSettings = vi.mocked(saveSettings).mock.calls[0][1] as any;
    expect(savedSettings.confirmedCommands['minikube status']).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe('removeRunCmdConsent', () => {
  it('returns when consent settings do not exist', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({});
    vi.mocked(saveSettings).mockClear();

    removeRunCmdConsent('@headlamp-k8s/minikube');

    expect(saveSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['@headlamp-k8s/minikube', 'minikube status'],
    ['@headlamp-k8s/minikubeprerelease', 'minikube status'],
    ['@headlamp-k8s/ai-assistant', 'gh auth'],
    ['@headlamp-k8s/ai-assistantprerelease', 'gh auth'],
  ])('removes consent for %s', async (pluginName, command) => {
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { [command]: true } });
    vi.mocked(saveSettings).mockClear();

    removeRunCmdConsent(pluginName);

    const savedSettings = vi.mocked(saveSettings).mock.calls[0][1] as any;
    expect(savedSettings.confirmedCommands[command]).toBeUndefined();
  });
});

describe('setupRunCmdHandlers', () => {
  it('does not register handlers without a main window', () => {
    const ipcMain = { on: vi.fn() } as any;

    setupRunCmdHandlers(null, ipcMain);

    expect(ipcMain.on).not.toHaveBeenCalled();
  });

  it('sends permission secrets once per main-frame load', () => {
    const ipcHandlers = new Map<string, (...args: any[]) => void>();
    let frameLoadHandler: (_event: unknown, isMainFrame: boolean) => void = () => {};
    const send = vi.fn();
    const mainWindow = {
      webContents: {
        on: vi.fn((_event: string, handler: typeof frameLoadHandler) => {
          frameLoadHandler = handler;
        }),
        send,
      },
    } as any;
    const ipcMain = {
      on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
        ipcHandlers.set(channel, handler);
      }),
    } as any;

    setupRunCmdHandlers(mainWindow, ipcMain);
    const requestSecrets = ipcHandlers.get('request-plugin-permission-secrets')!;
    requestSecrets();
    requestSecrets();
    frameLoadHandler({}, false);
    requestSecrets();
    frameLoadHandler({}, true);
    requestSecrets();

    expect(send).toHaveBeenCalledTimes(2);
    expect(ipcHandlers.has('run-command')).toBe(true);
  });
});

describe('command consent', () => {
  const fakeMainWindow = { id: 1 } as any;
  const permissionSecrets = { 'runCmd-gh': 99 };
  const eventData = {
    id: 'test-id',
    command: 'gh',
    args: ['auth', 'token'],
    options: {},
    permissionSecrets: { 'runCmd-gh': 99 },
  };
  let fakeEvent: any;

  beforeEach(async () => {
    const { loadSettings } = await import('./settings');
    // No saved answer for "gh auth", so the consent dialog is shown.
    vi.mocked(loadSettings).mockReturnValue({ confirmedCommands: {} });
    getShellEnvironmentMock.mockReset();
    getShellEnvironmentMock.mockResolvedValue(shellEnvironment);
    spawnMock.mockReset();
    spawnMock.mockReturnValue(
      Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
      })
    );
    showMessageBoxSyncMock.mockReset();
    fakeEvent = { sender: { send: vi.fn() } } as any;
  });

  it('does not run the command when the user denies consent', async () => {
    // Second button is Deny.
    showMessageBoxSyncMock.mockReturnValue(1);

    await handleRunCommand(fakeEvent, eventData, fakeMainWindow, permissionSecrets);

    expect(showMessageBoxSyncMock).toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(fakeEvent.sender.send).toHaveBeenCalledWith('command-exit', 'test-id', -3);
  });

  it('runs the command when the user allows it', async () => {
    // First button is Allow.
    showMessageBoxSyncMock.mockReturnValue(0);

    await handleRunCommand(fakeEvent, eventData, fakeMainWindow, permissionSecrets);

    expect(showMessageBoxSyncMock).toHaveBeenCalled();
    expect(spawnMock).toHaveBeenCalled();
  });
});
