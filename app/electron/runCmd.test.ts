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

import { dialog } from 'electron';
import { EventEmitter } from 'events';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import {
  addRunCmdConsent,
  checkCommandConsent,
  checkPermissionSecret,
  handleRunCommand,
  validateCommandData,
} from './runCmd';
import { loadSettings, saveSettings } from './settings';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showMessageBoxSync: vi.fn() },
}));

vi.mock('./plugin-management', () => ({
  defaultPluginsDir: vi.fn(() => '/plugins/default'),
  defaultUserPluginsDir: vi.fn(() => '/plugins/user'),
}));

vi.mock('./settings', () => ({
  loadSettings: vi.fn(() => ({
    confirmedCommands: { 'minikube start': true, gh: true, az: true, 'aws sso login': true },
  })),
  saveSettings: vi.fn(),
  SETTINGS_PATH: '/fake/settings.json',
}));

vi.mock('./i18next.config', () => ({
  default: { t: (s: string) => s },
}));

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

  it('returns false if any arg is not a string', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: ['start', 123 as any],
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

  it('returns false if options is an array', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: [] as any,
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

  it('returns false if permissionSecrets is an array', () => {
    expect(
      validateCommandData({
        command: 'minikube',
        args: [],
        options: {},
        permissionSecrets: [] as any,
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

  it('returns true for valid aws command', () => {
    expect(
      validateCommandData({
        command: 'aws',
        args: ['sso', 'login'],
        options: {},
        permissionSecrets: {},
      })[0]
    ).toBe(true);
  });
});

describe('checkCommandConsent', () => {
  afterEach(() => {
    vi.mocked(loadSettings).mockReturnValue({
      confirmedCommands: { 'minikube start': true, gh: true, az: true, 'aws sso login': true },
    } as any);
  });

  it('matches the "aws sso login" pre-consent entry using command + first two args', () => {
    expect(checkCommandConsent('aws', ['sso', 'login'], null as any)).toBe(true);
  });

  it('builds a distinct consent key for other "aws sso" subcommands', () => {
    // 'aws sso logout' was previously denied and saved as its own key, distinct
    // from 'aws sso login', proving the consent key includes the second arg.
    vi.mocked(loadSettings).mockReturnValue({
      confirmedCommands: { 'aws sso login': true, 'aws sso logout': false },
    } as any);
    expect(checkCommandConsent('aws', ['sso', 'logout'], null as any)).toBe(false);
    expect(checkCommandConsent('aws', ['sso', 'login'], null as any)).toBe(true);
  });

  it('blocks the command when the user denies it at the prompt', () => {
    vi.mocked(loadSettings).mockReturnValue({ confirmedCommands: {} } as any);
    vi.mocked(dialog.showMessageBoxSync).mockReturnValue(1); // Deny

    expect(checkCommandConsent('aws', ['ec2', 'describe-instances'], {} as any)).toBe(false);

    const savedSettings = vi.mocked(saveSettings).mock.calls.at(-1)![1] as any;
    expect(savedSettings.confirmedCommands['aws ec2 describe-instances']).toBe(false);
  });

  it('allows the command when the user allows it at the prompt', () => {
    vi.mocked(loadSettings).mockReturnValue({ confirmedCommands: {} } as any);
    vi.mocked(dialog.showMessageBoxSync).mockReturnValue(0); // Allow

    expect(checkCommandConsent('aws', ['ec2', 'describe-instances'], {} as any)).toBe(true);

    const savedSettings = vi.mocked(saveSettings).mock.calls.at(-1)![1] as any;
    expect(savedSettings.confirmedCommands['aws ec2 describe-instances']).toBe(true);
  });

  it('prompts the user when a corrupted non-boolean value is saved', () => {
    vi.mocked(loadSettings).mockReturnValue({
      confirmedCommands: { 'aws ec2 describe-instances': null },
    } as any);
    vi.mocked(dialog.showMessageBoxSync).mockReturnValue(0); // Allow

    expect(checkCommandConsent('aws', ['ec2', 'describe-instances'], {} as any)).toBe(true);
    expect(dialog.showMessageBoxSync).toHaveBeenCalled();
  });
});

describe('addRunCmdConsent', () => {
  afterEach(() => {
    vi.mocked(loadSettings).mockReturnValue({
      confirmedCommands: { 'minikube start': true, gh: true, az: true, 'aws sso login': true },
    } as any);
  });

  it('seeds "aws sso login" as pre-consented for the ai-assistant plugin', () => {
    vi.mocked(loadSettings).mockReturnValue({ confirmedCommands: {} } as any);
    addRunCmdConsent({ name: 'headlamp_ai-assistant' });
    const savedSettings = vi.mocked(saveSettings).mock.calls.at(-1)![1];
    expect(savedSettings.confirmedCommands['aws sso login']).toBe(true);
  });

  it('does not override a previously denied command with true', () => {
    vi.mocked(loadSettings).mockReturnValue({
      confirmedCommands: { 'aws sso login': false },
    } as any);
    addRunCmdConsent({ name: 'headlamp_ai-assistant' });
    const savedSettings = vi.mocked(saveSettings).mock.calls.at(-1)![1];
    expect(savedSettings.confirmedCommands['aws sso login']).toBe(false);
  });
});

describe('handleRunCommand - child process error event', () => {
  it('sends command-stderr and command-exit with -1 when child emits error', async () => {
    const childEmitter = new EventEmitter() as any;
    childEmitter.stdout = new EventEmitter();
    childEmitter.stderr = new EventEmitter();

    vi.mock('child_process', () => ({
      spawn: vi.fn(() => childEmitter),
    }));

    const { spawn } = await import('child_process');
    (spawn as Mock).mockReturnValue(childEmitter);

    const sentMessages: Array<[string, ...unknown[]]> = [];
    const fakeEvent = {
      sender: {
        send: vi.fn((...args: [string, ...unknown[]]) => sentMessages.push(args)),
      },
    } as any;

    const fakeMainWindow = { id: 1 } as any;
    const permissionSecrets = { 'runCmd-minikube': 99 };

    const eventData = {
      id: 'test-id',
      command: 'minikube',
      args: ['start'],
      options: {},
      permissionSecrets: { 'runCmd-minikube': 99 },
    };

    handleRunCommand(fakeEvent, eventData, fakeMainWindow, permissionSecrets);

    const err = new Error('spawn error');
    childEmitter.emit('error', err);

    expect(sentMessages).toContainEqual(['command-stderr', 'test-id', 'spawn error']);
    expect(sentMessages).toContainEqual(['command-exit', 'test-id', -1]);
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
