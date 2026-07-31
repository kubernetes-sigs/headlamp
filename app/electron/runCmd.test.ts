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

const { dialogMock, getShellEnvironmentMock, spawnMock } = vi.hoisted(() => ({
  dialogMock: vi.fn(),
  getShellEnvironmentMock: vi.fn(),
  spawnMock: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  dialog: { showMessageBoxSync: dialogMock },
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
  checkCommandCapability,
  checkCommandConsent,
  checkPermissionSecret,
  createCommandCapabilities,
  environmentOverrides,
  handleRunCommand,
  setupRunCmdHandlers,
  validateCommandData,
} from './runCmd';

describe('checkCommandConsent', () => {
  it('uses a previously allowed command without prompting', async () => {
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { 'kubectl get': true } });

    expect(checkCommandConsent('kubectl', ['get'], {} as any)).toBe(true);
    expect(dialogMock).not.toHaveBeenCalled();
  });

  it('rejects a previously denied command without prompting', async () => {
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { 'kubectl get': false } });

    expect(checkCommandConsent('kubectl', ['get'], {} as any)).toBe(false);
    expect(dialogMock).not.toHaveBeenCalled();
  });

  it('stores consent when the settings command map is absent', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    const settings = {} as any;
    vi.mocked(loadSettings).mockReturnValueOnce(settings);
    dialogMock.mockReturnValueOnce(0);

    expect(checkCommandConsent('gh', [], {} as any)).toBe(true);
    expect(settings.confirmedCommands).toEqual({ gh: true });
    expect(saveSettings).toHaveBeenCalledWith('/fake/settings.json', settings);
  });

  it('uses the command alone as the consent key when arguments are empty', async () => {
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { gh: true } });

    expect(checkCommandConsent('gh', [], {} as any)).toBe(true);
  });

  it('does not run a newly denied command', () => {
    dialogMock.mockReturnValue(1);

    expect(checkCommandConsent('kubectl', ['get'], {} as any)).toBe(false);
  });

  it('does not reuse consent across plugin identities', () => {
    dialogMock.mockReturnValue(1);

    expect(checkCommandConsent('az', ['account'], {} as any, '@example/plugin')).toBe(false);
    expect(dialogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: '@example/plugin: az account' })
    );
  });
});

describe('plugin command capabilities', () => {
  it('binds a capability to its plugin command scope', () => {
    const { capabilities, scopeByCapability } = createCommandCapabilities([
      {
        pluginName: '@example/plugin',
        scopes: [{ command: 'kubectl', args: ['get'] }],
      },
    ]);
    const capability = capabilities['@example/plugin'][0].capability;

    expect(
      checkCommandCapability(
        {
          id: '1',
          command: 'kubectl',
          args: ['get', 'pods'],
          options: {},
          permissionSecrets: {},
          capability,
        },
        scopeByCapability
      )
    ).toEqual([true, '']);
    expect(
      checkCommandCapability(
        {
          id: '2',
          command: 'kubectl',
          args: ['delete', 'pods'],
          options: {},
          permissionSecrets: {},
          capability,
        },
        scopeByCapability
      )
    ).toEqual([false, 'Command is outside its declared plugin scope']);
  });

  it('ignores malformed and duplicate scopes', () => {
    const { capabilities } = createCommandCapabilities([
      {
        pluginName: 'example',
        scopes: [
          { command: 'kubectl', args: ['get'] },
          { command: 'kubectl', args: ['get'] },
          { command: '../shell', args: [] },
          { command: 'scriptjs', args: ['plugin/script.js'] },
        ],
      },
    ]);

    expect(capabilities.example).toHaveLength(1);
  });

  it.each([null, {}, Array.from({ length: 257 }, () => ({ pluginName: 'example', scopes: [] }))])(
    'rejects an invalid registration collection',
    (registrations: unknown) => {
      const { capabilities, scopeByCapability } = createCommandCapabilities(registrations);

      expect(capabilities).toEqual({});
      expect(scopeByCapability.size).toBe(0);
    }
  );

  it.each([
    null,
    { pluginName: 1, scopes: [] },
    { pluginName: '../example', scopes: [] },
    { pluginName: 'a'.repeat(215), scopes: [] },
    { pluginName: 'example', scopes: null },
    {
      pluginName: 'example',
      scopes: Array.from({ length: 65 }, () => ({ command: 'gh', args: [] })),
    },
  ])('ignores an invalid plugin registration', (registration: unknown) => {
    const { capabilities, scopeByCapability } = createCommandCapabilities([registration]);

    expect(capabilities).toEqual({});
    expect(scopeByCapability.size).toBe(0);
  });

  it.each([
    null,
    { command: 1, args: [] },
    { command: '', args: [] },
    { command: 'a'.repeat(129), args: [] },
    { command: '../gh', args: [] },
    { command: 'scriptjs', args: [] },
    { command: 'gh', args: null },
    { command: 'gh', args: Array.from({ length: 17 }, () => 'arg') },
    { command: 'gh', args: [1] },
    { command: 'gh', args: ['a'.repeat(257)] },
    { command: 'gh', args: ['bad\0argument'] },
  ])('ignores an invalid command scope', (scope: unknown) => {
    const { capabilities, scopeByCapability } = createCommandCapabilities([
      { pluginName: 'example', scopes: [scope] },
    ]);

    expect(capabilities.example).toEqual([]);
    expect(scopeByCapability.size).toBe(0);
  });

  it('rejects missing capabilities and incomplete argument prefixes', () => {
    const { capabilities, scopeByCapability } = createCommandCapabilities([
      { pluginName: 'example', scopes: [{ command: 'gh', args: ['auth', 'token'] }] },
    ]);
    const baseCommand = {
      id: '1',
      command: 'gh',
      args: ['auth'],
      options: {},
      permissionSecrets: {},
    };

    expect(checkCommandCapability(baseCommand, scopeByCapability)[0]).toBe(false);
    expect(
      checkCommandCapability(
        { ...baseCommand, capability: capabilities.example[0].capability },
        scopeByCapability
      )[0]
    ).toBe(false);
  });
});

describe('setupRunCmdHandlers command capabilities', () => {
  function setup() {
    const listeners = new Map<string, (...args: any[]) => any>();
    const handlers = new Map<string, (...args: any[]) => any>();
    const frameListeners = new Map<string, (...args: any[]) => any>();
    const webContents = {
      on: vi.fn((channel: string, listener: (...args: any[]) => unknown) => {
        frameListeners.set(channel, listener);
      }),
      send: vi.fn(),
    };
    const mainWindow = { webContents } as any;
    const ipcMain = {
      on: vi.fn((channel: string, listener: (...args: any[]) => unknown) => {
        listeners.set(channel, listener);
      }),
      handle: vi.fn((channel: string, listener: (...args: any[]) => unknown) => {
        handlers.set(channel, listener);
      }),
    } as any;

    setupRunCmdHandlers(mainWindow, ipcMain);
    return { frameListeners, handlers, listeners, mainWindow, webContents };
  }

  it('accepts one registration from the main renderer', async () => {
    const { handlers, webContents } = setup();
    const register = handlers.get('register-plugin-command-capabilities')!;
    const registrations = [
      { pluginName: 'example', scopes: [{ command: 'gh', args: ['--version'] }] },
    ];

    const capabilities = await register({ sender: webContents }, registrations);

    expect(capabilities.example).toHaveLength(1);
    expect(register({ sender: webContents }, registrations)).toEqual({});
    expect(register({ sender: {} }, registrations)).toEqual({});
  });

  it('resets registration only after the main frame reloads', async () => {
    const { frameListeners, handlers, webContents } = setup();
    const register = handlers.get('register-plugin-command-capabilities')!;
    const didFinishLoad = frameListeners.get('did-frame-finish-load')!;
    const registrations = [{ pluginName: 'example', scopes: [] }];

    await register({ sender: webContents }, registrations);
    didFinishLoad({}, false);
    expect(register({ sender: webContents }, registrations)).toEqual({});

    didFinishLoad({}, true);
    expect(register({ sender: webContents }, registrations)).toEqual({ example: [] });
  });

  it('does not install handlers without a main window', () => {
    const ipcMain = { handle: vi.fn(), on: vi.fn() } as any;

    setupRunCmdHandlers(null, ipcMain);

    expect(ipcMain.handle).not.toHaveBeenCalled();
    expect(ipcMain.on).not.toHaveBeenCalled();
  });
});

it('does not cache process environment changes as shell overrides', () => {
  expect(
    environmentOverrides(
      { PATH: '/opt/homebrew/bin:/usr/bin', HEADLAMP_CONFIG_ENABLE_HELM: 'true' },
      { PATH: '/usr/bin', HEADLAMP_CONFIG_ENABLE_HELM: 'true' }
    )
  ).toEqual({ PATH: '/opt/homebrew/bin:/usr/bin' });
});

it('uses the current process environment by default', () => {
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
        command: 'scriptjs',
        args: ['myscript.js'],
        options: {},
        permissionSecrets: { 'runCmd-scriptjs-myscript.js': 42 },
      })[0]
    ).toBe(true);
  });

  it('accepts a structurally valid declared command capability', () => {
    expect(
      validateCommandData({
        command: 'kubectl',
        args: ['get'],
        options: {},
        permissionSecrets: {},
        capability: 'a'.repeat(64),
      })[0]
    ).toBe(true);
  });

  it('rejects a malformed command capability', () => {
    expect(
      validateCommandData({
        command: 'kubectl',
        args: ['get'],
        options: {},
        permissionSecrets: {},
        capability: 'not-a-capability',
      })[0]
    ).toBe(false);
  });

  it.each([{ stdio: 'ignore' }, { cwd: '/tmp' }, [], Object.create(null)])(
    'rejects spawn options for a declared command capability',
    (options: object) => {
      expect(
        validateCommandData({
          command: 'kubectl',
          args: ['get'],
          options,
          permissionSecrets: {},
          capability: 'a'.repeat(64),
        })
      ).toEqual([false, 'Command capabilities do not allow spawn options']);
    }
  );
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
  });

  it('runs a command only within its manifest-declared capability', async () => {
    const { capabilities, scopeByCapability } = createCommandCapabilities([
      {
        pluginName: '@example/plugin',
        scopes: [{ command: 'kubectl', args: ['get'] }],
      },
    ]);
    dialogMock.mockReturnValue(0);

    await handleRunCommand(
      fakeEvent,
      {
        id: 'declared-command',
        command: 'kubectl',
        args: ['get', 'pods'],
        options: {},
        permissionSecrets: {},
        capability: capabilities['@example/plugin'][0].capability,
      },
      { id: 1 } as any,
      {},
      scopeByCapability
    );

    expect(spawnMock).toHaveBeenCalledWith(
      'kubectl',
      ['get', 'pods'],
      expect.objectContaining({ shell: false })
    );
  });

  it('does not spawn a capability command with plugin-controlled options', async () => {
    const { capabilities, scopeByCapability } = createCommandCapabilities([
      {
        pluginName: '@example/plugin',
        scopes: [{ command: 'kubectl', args: ['get'] }],
      },
    ]);

    await handleRunCommand(
      fakeEvent,
      {
        id: 'declared-command-options',
        command: 'kubectl',
        args: ['get', 'pods'],
        options: { stdio: 'ignore' },
        permissionSecrets: {},
        capability: capabilities['@example/plugin'][0].capability,
      },
      { id: 1 } as any,
      {},
      scopeByCapability
    );

    expect(spawnMock).not.toHaveBeenCalled();
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
    process.exit = exitMock as unknown as typeof process.exit;
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
  ])('pre-populates AI assistant commands for plugin name "%s"', async (pluginName: string) => {
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
});
