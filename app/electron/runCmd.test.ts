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

import crypto from 'crypto';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';

const {
  defaultPluginsDirMock,
  defaultUserPluginsDirMock,
  getShellEnvironmentMock,
  preparePluginExecutableMock,
  preparePluginScriptMock,
  removePreparedPluginExecutableMock,
  removePreparedPluginScriptMock,
  spawnMock,
  showMessageBoxSyncMock,
  verifyPluginInstallationIntegrityMock,
} = vi.hoisted(() => ({
  defaultPluginsDirMock: vi.fn(() => '/plugins/default'),
  defaultUserPluginsDirMock: vi.fn(() => '/plugins/user'),
  getShellEnvironmentMock: vi.fn(),
  preparePluginExecutableMock: vi.fn(),
  preparePluginScriptMock: vi.fn(),
  removePreparedPluginExecutableMock: vi.fn(),
  removePreparedPluginScriptMock: vi.fn(),
  spawnMock: vi.fn(),
  showMessageBoxSyncMock: vi.fn(),
  verifyPluginInstallationIntegrityMock: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showMessageBoxSync: showMessageBoxSyncMock },
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('./plugin-management', () => ({
  defaultPluginsDir: defaultPluginsDirMock,
  defaultUserPluginsDir: defaultUserPluginsDirMock,
  PREPARED_PLUGIN_SCRIPTS_PATH: '/plugins/prepared',
  preparePluginExecutable: preparePluginExecutableMock,
  preparePluginScript: preparePluginScriptMock,
  removePreparedPluginExecutable: removePreparedPluginExecutableMock,
  removePreparedPluginScript: removePreparedPluginScriptMock,
  verifyPluginInstallationIntegrity: verifyPluginInstallationIntegrityMock,
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
  createProductCommandCapabilities,
  environmentOverrides,
  handleRunCommand,
  removeRunCmdConsent,
  revokeRunCmdCapabilities,
  setupRunCmdHandlers,
  systemCommandEnvironment,
  validateCommandData,
  verifyPluginCommandPolicies,
} from './runCmd';

describe('verifyPluginCommandPolicies', () => {
  const source = 'console.log("trusted");';
  const sourceDigest = crypto.createHash('sha256').update(source).digest('hex');
  const policies = [
    {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      source: 'shipped' as const,
      grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
    },
  ];
  const registrations = [
    {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      path: 'static-plugins/example-plugin',
      source: 'shipped',
      type: 'shipped',
      sourceDigest,
    },
  ];

  it('accepts an exact package identity from a regular shipped bundle', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-policy-'));
    const bundle = path.join(root, 'example-plugin');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'package.json'), '{"name":"@example/plugin"}');
    fs.writeFileSync(path.join(bundle, 'main.js'), source);
    try {
      const result = await verifyPluginCommandPolicies(policies, registrations, {
        development: path.join(root, 'development'),
        user: path.join(root, 'user'),
        shipped: root,
      });
      expect(result).toEqual(policies);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  it('rejects missing, spoofed, or escaping shipped identities', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-policy-'));
    const bundle = path.join(root, 'example-plugin');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'package.json'), '{"name":"@attacker/plugin"}');
    fs.writeFileSync(path.join(bundle, 'main.js'), source);
    try {
      const roots = {
        development: path.join(root, 'development'),
        user: path.join(root, 'user'),
        shipped: root,
      };
      expect(await verifyPluginCommandPolicies(policies, registrations, roots)).toEqual([]);
      expect(
        await verifyPluginCommandPolicies(
          [{ ...policies[0], bundleName: '../example-plugin' }],
          registrations,
          roots
        )
      ).toEqual([]);
      expect(
        await verifyPluginCommandPolicies(policies, registrations, {
          ...roots,
          shipped: path.join(root, 'missing'),
        })
      ).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  it('fails closed when Electron resourcesPath is unavailable', async () => {
    const resourcesPathDescriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
    Object.defineProperty(process, 'resourcesPath', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      expect(await verifyPluginCommandPolicies(policies, registrations)).toEqual([]);
    } finally {
      if (resourcesPathDescriptor) {
        Object.defineProperty(process, 'resourcesPath', resourcesPathDescriptor);
      } else {
        Reflect.deleteProperty(process, 'resourcesPath');
      }
    }
  });

  it('requires matching app-owned Artifact Hub provenance for managed plugins', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-policy-'));
    const bundle = path.join(root, 'example-plugin');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'package.json'), '{"name":"@example/plugin"}');
    fs.writeFileSync(path.join(bundle, 'main.js'), source);
    const managedPolicy = {
      ...policies[0],
      source: 'user' as const,
      artifactHub: {
        repository: 'headlamp-plugins',
        package: 'headlamp_minikube',
        packageId: 'fbc182b5-eb90-42b7-ace8-62a7576abafd',
        repositoryId: '767e1f40-ee09-401b-b8d4-930740da5a8a',
      },
    };
    const roots = {
      development: path.join(root, 'development'),
      user: root,
      shipped: path.join(root, 'shipped'),
    };
    const userRegistrations = registrations.map(registration => ({
      ...registration,
      path: 'user-plugins/example-plugin',
      source: 'user',
      type: 'user',
    }));
    try {
      verifyPluginInstallationIntegrityMock.mockResolvedValueOnce(false);
      expect(await verifyPluginCommandPolicies([managedPolicy], userRegistrations, roots)).toEqual(
        []
      );
      expect(verifyPluginInstallationIntegrityMock).toHaveBeenCalledWith(
        bundle,
        managedPolicy.artifactHub
      );

      verifyPluginInstallationIntegrityMock.mockResolvedValueOnce(true);
      expect(await verifyPluginCommandPolicies([managedPolicy], userRegistrations, roots)).toEqual([
        managedPolicy,
      ]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });

  it('rejects a capability when cached source differs from on-disk main.js', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-policy-'));
    const bundle = path.join(root, 'example-plugin');
    fs.mkdirSync(bundle);
    fs.writeFileSync(path.join(bundle, 'package.json'), '{"name":"@example/plugin"}');
    fs.writeFileSync(path.join(bundle, 'main.js'), 'console.log("restored");');
    try {
      await expect(
        verifyPluginCommandPolicies(policies, registrations, {
          development: path.join(root, 'development'),
          user: path.join(root, 'user'),
          shipped: root,
        })
      ).resolves.toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true });
    }
  });
});

describe('createProductCommandCapabilities', () => {
  const sourceDigest = 'a'.repeat(64);
  const policies = [
    {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      source: 'shipped' as const,
      grants: [{ tool: 'examplectl', args: ['project', 'list'], allowTrailingArgs: true }],
    },
  ];

  it('issues an opaque capability for an exact shipped plugin identity', () => {
    const result = createProductCommandCapabilities(
      [
        {
          bundleName: 'example-plugin',
          packageName: '@example/plugin',
          path: 'static-plugins/example-plugin',
          source: 'shipped',
          type: 'shipped',
          sourceDigest,
        },
      ],
      policies,
      7
    );

    expect(result.capabilities).toEqual([
      {
        bundleName: 'example-plugin',
        packageName: '@example/plugin',
        capability: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(result.capabilityRegistry.get(result.capabilities[0].capability)).toEqual({
      ...policies[0],
      webContentsId: 7,
    });
  });

  it('grants shipped AI Assistant system commands only to its exact identity', () => {
    const aiPolicy = {
      bundleName: 'headlamp_ai-assistant',
      packageName: '@headlamp-k8s/ai-assistant',
      source: 'shipped' as const,
      grants: [{ tool: 'gh', args: ['auth'], allowTrailingArgs: true }],
    };
    const result = createProductCommandCapabilities(
      [
        {
          bundleName: 'headlamp_ai-assistant',
          packageName: '@headlamp-k8s/ai-assistant',
          path: 'static-plugins/headlamp_ai-assistant',
          source: 'shipped',
          type: 'shipped',
          sourceDigest,
        },
        {
          bundleName: 'unrelated-plugin',
          packageName: '@example/unrelated',
          path: 'static-plugins/unrelated-plugin',
          source: 'shipped',
          type: 'shipped',
          sourceDigest,
        },
      ],
      [aiPolicy],
      7
    );

    expect(result.capabilities).toEqual([
      {
        bundleName: 'headlamp_ai-assistant',
        packageName: '@headlamp-k8s/ai-assistant',
        capability: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(result.capabilityRegistry.get(result.capabilities[0].capability)?.grants).toEqual([
      { tool: 'gh', args: ['auth'], allowTrailingArgs: true },
    ]);
  });

  it('issues a capability for an exact development plugin policy', () => {
    const developmentPolicy = {
      ...policies[0],
      bundleName: 'example-plugin-dev',
      source: 'development' as const,
    };
    const result = createProductCommandCapabilities(
      [
        {
          bundleName: 'example-plugin-dev',
          packageName: '@example/plugin',
          path: 'plugins/example-plugin-dev',
          source: 'development',
          type: 'development',
          sourceDigest,
        },
      ],
      [developmentPolicy],
      7
    );

    expect(result.capabilities).toHaveLength(1);
    expect(result.capabilityRegistry.get(result.capabilities[0].capability)).toEqual({
      ...developmentPolicy,
      webContentsId: 7,
    });
  });

  it('issues a development-source capability for a migrated user plugin', () => {
    const developmentPolicy = {
      ...policies[0],
      source: 'development' as const,
    };
    const result = createProductCommandCapabilities(
      [
        {
          bundleName: 'example-plugin',
          packageName: '@example/plugin',
          path: 'plugins/example-plugin',
          source: 'development',
          type: 'user',
          sourceDigest,
        },
      ],
      [developmentPolicy],
      7
    );

    expect(result.capabilities).toHaveLength(1);
  });

  it.each([
    ['user source', { source: 'user' }],
    ['invalid type', { type: 'invalid' }],
    ['package spoof', { packageName: '@attacker/plugin' }],
    ['bundle path spoof', { path: 'user-plugins/example-plugin' }],
  ])('does not issue a capability for %s', (_name, override) => {
    const result = createProductCommandCapabilities(
      [
        {
          bundleName: 'example-plugin',
          packageName: '@example/plugin',
          path: 'static-plugins/example-plugin',
          source: 'shipped',
          type: 'shipped',
          sourceDigest,
          ...override,
        },
      ],
      policies,
      7
    );

    expect(result.capabilities).toEqual([]);
    expect(result.capabilityRegistry.size).toBe(0);
  });

  it('denies an ambiguous duplicate identity', () => {
    const registration = {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      path: 'static-plugins/example-plugin',
      source: 'shipped',
      type: 'shipped',
      sourceDigest,
    };
    const result = createProductCommandCapabilities(
      [registration, registration, registration],
      policies,
      7
    );

    expect(result.capabilities).toEqual([]);
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

it('uses process.env as the default comparison environment', () => {
  expect(environmentOverrides(process.env)).toEqual({});
});

it('removes plugin-controlled directories from the system command PATH', () => {
  expect(
    systemCommandEnvironment(
      {
        PATH: ['/plugins/user/attacker/bin', '/usr/local/bin', '/plugins/shipped/tool/bin'].join(
          path.delimiter
        ),
      },
      {
        development: '/plugins/development',
        user: '/plugins/user',
        shipped: '/plugins/shipped',
      }
    )
  ).toEqual({ PATH: '/usr/local/bin' });
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

  const productConsentKey = (
    source: 'development' | 'user' | 'shipped',
    command: string,
    args: string[]
  ) =>
    `run-command-consent:v2:${JSON.stringify([
      { source, packageName: '@example/plugin', bundleName: 'example-plugin' },
      command,
      args,
    ])}`;

  beforeEach(() => {
    defaultPluginsDirMock.mockReturnValue('/plugins/default');
    defaultUserPluginsDirMock.mockReturnValue('/plugins/user');
    getShellEnvironmentMock.mockReset();
    getShellEnvironmentMock.mockResolvedValue(shellEnvironment);
    spawnMock.mockReset();
    preparePluginExecutableMock.mockReset();
    preparePluginExecutableMock.mockImplementation(
      async (_bundlePath: string, _executablePath: string, absoluteExecutablePath: string) => ({
        ok: true,
        executablePath: absoluteExecutablePath,
      })
    );
    removePreparedPluginExecutableMock.mockReset();
    preparePluginScriptMock.mockReset();
    preparePluginScriptMock.mockResolvedValue({
      ok: true,
      scriptPath: '/prepared/script.js',
    });
    removePreparedPluginScriptMock.mockReset();
    verifyPluginInstallationIntegrityMock.mockReset();
    verifyPluginInstallationIntegrityMock.mockReturnValue(true);
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
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

    const err = Object.assign(new Error('spawn error with /private/user/path'), { code: 'EACCES' });
    childEmitter.emit('error', err);

    expect(sentMessages).toContainEqual([
      'command-stderr',
      'test-id',
      'spawn error with /private/user/path',
    ]);
    expect(sentMessages).toContainEqual(['command-exit', 'test-id', -1]);
    expect(consoleError).toHaveBeenCalledWith('Command process error', {
      tool: 'gh',
      reason: 'EACCES',
    });

    childEmitter.emit('close', null);
    expect(sentMessages.filter(([channel]) => channel === 'command-exit')).toHaveLength(1);
    consoleError.mockRestore();
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    spawnMock.mockImplementation(() => {
      throw Object.assign(new Error('spawn failed with /private/user/path'), { code: 'ENOENT' });
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

    expect(sentMessages).toContainEqual([
      'command-stderr',
      'test-id',
      'spawn failed with /private/user/path',
    ]);
    expect(sentMessages).toContainEqual(['command-exit', 'test-id', -1]);
    expect(consoleError).toHaveBeenCalledWith('Failed to spawn command', {
      tool: 'gh',
      reason: 'ENOENT',
    });
    consoleError.mockRestore();
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

  it('enforces a product grant before spawning with no shell', async () => {
    const capability = 'a'.repeat(64);
    const registry = new Map([
      [
        capability,
        {
          bundleName: 'example-plugin',
          packageName: '@example/plugin',
          source: 'shipped' as const,
          grants: [{ tool: 'examplectl', args: ['project', 'list'], allowTrailingArgs: true }],
          webContentsId: 7,
        },
      ],
    ]);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('shipped', 'examplectl', ['project', 'list'])]: true,
      },
    });

    await handleRunCommand(
      fakeEvent,
      {
        id: 'capability-id',
        command: 'examplectl',
        args: ['project', 'list', '--all'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      registry
    );

    expect(spawnMock).toHaveBeenCalledWith(
      'examplectl',
      ['project', 'list', '--all'],
      expect.objectContaining({ shell: false })
    );
  });

  it('revalidates a capability after verifying plugin executable integrity', async () => {
    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-bin-'));
    const bundleRoot = path.join(userRoot, 'example-plugin');
    const executable = path.join(bundleRoot, 'bin', 'examplectl');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, '');
    let resolveIntegrity!: (result: { ok: true; executablePath: string }) => void;
    let markVerificationStarted!: () => void;
    const verificationStarted = new Promise<void>(resolve => {
      markVerificationStarted = resolve;
    });
    preparePluginExecutableMock.mockImplementationOnce(() => {
      markVerificationStarted();
      return new Promise(resolve => {
        resolveIntegrity = resolve;
      });
    });
    const capability = 'a'.repeat(64);
    const registration = {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      source: 'user' as const,
      grants: [
        {
          tool: 'examplectl',
          executable: { source: 'plugin' as const, path: 'bin/examplectl' },
          args: ['project', 'list'],
        },
      ],
      webContentsId: 7,
    };
    const registry = new Map([[capability, registration]]);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('user', 'examplectl', ['project', 'list'])]: true,
      },
    });

    try {
      const commandPromise = handleRunCommand(
        fakeEvent,
        {
          id: 'plugin-bin-id',
          command: 'examplectl',
          args: ['project', 'list'],
          options: {},
          permissionSecrets: {},
          capability,
        },
        { id: 1 } as any,
        {},
        registry,
        undefined,
        { development: '/plugins/development', user: userRoot, shipped: '/plugins/shipped' }
      );
      await verificationStarted;
      registry.clear();
      resolveIntegrity({ ok: true, executablePath: '/prepared/run/examplectl' });
      await commandPromise;

      expect(spawnMock).not.toHaveBeenCalled();
      expect(removePreparedPluginExecutableMock).toHaveBeenCalledWith('/prepared/run/examplectl');
      expect(sentMessages).toEqual([['command-exit', 'plugin-bin-id', -2]]);
    } finally {
      fs.rmSync(userRoot, { recursive: true, force: true });
    }
  });

  it('rejects a plugin executable without a valid installation receipt', async () => {
    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-bin-'));
    const executable = path.join(userRoot, 'example-plugin', 'bin', 'examplectl');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, 'replaced');
    preparePluginExecutableMock.mockResolvedValueOnce({
      ok: false,
      reason: 'digest-mismatch',
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('user', 'examplectl', ['project', 'list'])]: true,
      },
    });

    await handleRunCommand(
      fakeEvent,
      {
        id: 'plugin-bin-id',
        command: 'examplectl',
        args: ['project', 'list'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'user' as const,
            grants: [
              {
                tool: 'examplectl',
                executable: { source: 'plugin', path: 'bin/examplectl' },
                args: ['project', 'list'],
              },
            ],
            webContentsId: 7,
          },
        ],
      ]),
      undefined,
      { development: '/plugins/development', user: userRoot, shipped: '/plugins/shipped' }
    );

    expect(spawnMock).not.toHaveBeenCalled();
    expect(fakeEvent.sender.send).toHaveBeenCalledWith('command-exit', 'plugin-bin-id', -2);
    expect(consoleError).toHaveBeenCalledWith('Plugin executable unavailable', {
      tool: 'examplectl',
      reason: 'digest-mismatch',
      packageName: '@example/plugin',
      bundleName: 'example-plugin',
      source: 'user',
    });
    consoleError.mockRestore();
    fs.rmSync(userRoot, { recursive: true, force: true });
  });

  it('guides users to reinstall when executable integrity metadata is missing', async () => {
    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-bin-'));
    const executable = path.join(userRoot, 'example-plugin', 'bin', 'examplectl');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, 'legacy');
    preparePluginExecutableMock.mockResolvedValueOnce({
      ok: false,
      reason: 'missing-receipt',
    });
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('user', 'examplectl', ['project', 'list'])]: true,
      },
    });

    await handleRunCommand(
      fakeEvent,
      {
        id: 'legacy-bin-id',
        command: 'examplectl',
        args: ['project', 'list'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'user' as const,
            grants: [
              {
                tool: 'examplectl',
                executable: { source: 'plugin', path: 'bin/examplectl' },
                args: ['project', 'list'],
              },
            ],
            webContentsId: 7,
          },
        ],
      ]),
      undefined,
      { development: '/plugins/development', user: userRoot, shipped: '/plugins/shipped' }
    );

    expect(spawnMock).not.toHaveBeenCalled();
    expect(fakeEvent.sender.send).toHaveBeenCalledWith(
      'command-stderr',
      'legacy-bin-id',
      'Plugin executable integrity metadata is missing. Update or reinstall the plugin.'
    );
    expect(fakeEvent.sender.send).toHaveBeenCalledWith('command-exit', 'legacy-bin-id', -2);
    fs.rmSync(userRoot, { recursive: true, force: true });
  });

  it('runs a confined development-inventory executable without an installation receipt', async () => {
    const developmentRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-bin-'));
    const executable = path.join(developmentRoot, 'minikube', 'bin', 'minikube');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, 'development');
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    try {
      await handleRunCommand(
        fakeEvent,
        {
          id: 'development-bin-id',
          command: 'minikube',
          args: ['start'],
          options: {},
          permissionSecrets: {},
          capability,
        },
        { id: 1 } as any,
        {},
        new Map([
          [
            capability,
            {
              bundleName: 'minikube',
              packageName: '@headlamp-k8s/minikube',
              source: 'development' as const,
              grants: [
                {
                  tool: 'minikube',
                  executable: { source: 'plugin', path: 'bin/minikube' },
                  args: ['start'],
                },
              ],
              webContentsId: 7,
            },
          ],
        ]),
        undefined,
        {
          development: developmentRoot,
          user: '/plugins/user',
          shipped: '/plugins/shipped',
        }
      );

      expect(spawnMock).toHaveBeenCalledWith(
        fs.realpathSync(executable),
        ['start'],
        expect.objectContaining({ shell: false })
      );
      expect(preparePluginExecutableMock).not.toHaveBeenCalled();

      await handleRunCommand(
        fakeEvent,
        {
          id: 'packaged-bin-id',
          command: 'minikube',
          args: ['start'],
          options: {},
          permissionSecrets: {},
          capability,
        },
        { id: 1 } as any,
        {},
        new Map([
          [
            capability,
            {
              bundleName: 'minikube',
              packageName: '@headlamp-k8s/minikube',
              source: 'development' as const,
              grants: [
                {
                  tool: 'minikube',
                  executable: { source: 'plugin', path: 'bin/minikube' },
                  args: ['start'],
                },
              ],
              webContentsId: 7,
            },
          ],
        ]),
        undefined,
        {
          development: developmentRoot,
          user: '/plugins/user',
          shipped: '/plugins/shipped',
        }
      );
      expect(preparePluginExecutableMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(developmentRoot, { recursive: true, force: true });
    }
  });

  it('resolves a product script from its authorized plugin inventory', async () => {
    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-script-'));
    const bundleRoot = path.join(userRoot, 'example-plugin');
    fs.mkdirSync(bundleRoot);
    fs.writeFileSync(path.join(bundleRoot, 'script.js'), '');
    defaultUserPluginsDirMock.mockReturnValue(userRoot);
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('user', 'scriptjs', ['example-plugin/script.js'])]: true,
      },
    });

    await handleRunCommand(
      fakeEvent,
      {
        id: 'script-capability-id',
        command: 'scriptjs',
        args: ['example-plugin/script.js'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'user' as const,
            artifactHub: {
              repository: 'headlamp-plugins',
              package: 'headlamp_minikube',
              packageId: 'fbc182b5-eb90-42b7-ace8-62a7576abafd',
              repositoryId: '767e1f40-ee09-401b-b8d4-930740da5a8a',
            },
            grants: [{ tool: 'scriptjs', args: ['example-plugin/script.js'] }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ['/prepared/script.js'],
      expect.objectContaining({ shell: false })
    );
    expect(preparePluginScriptMock).toHaveBeenCalledWith(
      fs.realpathSync(bundleRoot),
      'script.js',
      expect.objectContaining({
        packageId: 'fbc182b5-eb90-42b7-ace8-62a7576abafd',
        repositoryId: '767e1f40-ee09-401b-b8d4-930740da5a8a',
      })
    );
    childEmitter.emit('close', 0);
    expect(removePreparedPluginScriptMock).toHaveBeenCalledWith('/prepared/script.js');
    fs.rmSync(userRoot, { recursive: true, force: true });
  });

  it('rejects a product script outside its authorized plugin bundle', async () => {
    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-script-'));
    fs.mkdirSync(path.join(userRoot, 'example-plugin'));
    fs.mkdirSync(path.join(userRoot, 'shadow-plugin'));
    fs.writeFileSync(path.join(userRoot, 'shadow-plugin', 'script.js'), '');
    defaultUserPluginsDirMock.mockReturnValue(userRoot);
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('user', 'scriptjs', ['shadow-plugin/script.js'])]: true,
      },
    });

    await handleRunCommand(
      fakeEvent,
      {
        id: 'script-capability-id',
        command: 'scriptjs',
        args: ['shadow-plugin/script.js'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'user' as const,
            grants: [{ tool: 'scriptjs', args: ['shadow-plugin/script.js'] }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'script-capability-id', -2]]);
    fs.rmSync(userRoot, { recursive: true, force: true });
  });

  it('rejects a product script when its bundle is replaced by a symlink', async () => {
    const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-script-'));
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-external-'));
    fs.writeFileSync(path.join(externalRoot, 'script.js'), '');
    fs.symlinkSync(
      externalRoot,
      path.join(userRoot, 'example-plugin'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    defaultUserPluginsDirMock.mockReturnValue(userRoot);
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('user', 'scriptjs', ['example-plugin/script.js'])]: true,
      },
    });

    await handleRunCommand(
      fakeEvent,
      {
        id: 'script-capability-id',
        command: 'scriptjs',
        args: ['example-plugin/script.js'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'user' as const,
            grants: [{ tool: 'scriptjs', args: ['example-plugin/script.js'] }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'script-capability-id', -2]]);
    fs.rmSync(userRoot, { recursive: true, force: true });
    fs.rmSync(externalRoot, { recursive: true, force: true });
  });

  it('stores product consent with an unambiguous argument-vector key', async () => {
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    showMessageBoxSyncMock.mockReturnValueOnce(0);
    const { loadSettings, saveSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: {} });
    vi.mocked(saveSettings).mockClear();

    await handleRunCommand(
      fakeEvent,
      {
        id: 'capability-id',
        command: 'examplectl',
        args: ['a b'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'shipped' as const,
            grants: [{ tool: 'examplectl', args: ['a b'] }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(saveSettings).toHaveBeenCalledWith(
      '/fake/settings.json',
      expect.objectContaining({
        confirmedCommands: {
          [productConsentKey('shipped', 'examplectl', ['a b'])]: true,
        },
      })
    );
    expect(showMessageBoxSyncMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ detail: '@example/plugin@example-plugin: examplectl a b' })
    );
  });

  it('honors legacy consent for a historically authorized plugin identity', async () => {
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { 'gh auth': false } });
    showMessageBoxSyncMock.mockClear();

    await handleRunCommand(
      fakeEvent,
      {
        id: 'legacy-consent-id',
        command: 'gh',
        args: ['auth', 'status'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'headlamp_ai-assistant',
            packageName: '@headlamp-k8s/ai-assistant',
            source: 'development' as const,
            grants: [{ tool: 'gh', args: ['auth'], allowTrailingArgs: true }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(showMessageBoxSyncMock).not.toHaveBeenCalled();
    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'legacy-consent-id', -3]]);
  });

  it('does not reuse source-less consent for a command outside the plugin history', async () => {
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { 'gh auth': false } });
    showMessageBoxSyncMock.mockReturnValueOnce(0);

    await handleRunCommand(
      fakeEvent,
      {
        id: 'cross-plugin-consent-id',
        command: 'gh',
        args: ['auth', 'status'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'headlamp_minikube',
            packageName: '@headlamp-k8s/minikube',
            source: 'development' as const,
            grants: [{ tool: 'gh', args: ['auth'], allowTrailingArgs: true }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(showMessageBoxSyncMock).toHaveBeenCalledOnce();
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it('does not reuse source-less legacy consent for another development plugin', async () => {
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({ confirmedCommands: { 'gh auth': false } });
    showMessageBoxSyncMock.mockClear();
    showMessageBoxSyncMock.mockReturnValueOnce(0);

    await handleRunCommand(
      fakeEvent,
      {
        id: 'source-consent-id',
        command: 'gh',
        args: ['auth', 'status'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'development' as const,
            grants: [{ tool: 'gh', args: ['auth'], allowTrailingArgs: true }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(showMessageBoxSyncMock).toHaveBeenCalledOnce();
    expect(spawnMock).toHaveBeenCalledOnce();
  });

  it('revalidates a capability after resolving the shell environment', async () => {
    let resolveEnvironment!: (environment: NodeJS.ProcessEnv) => void;
    getShellEnvironmentMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolveEnvironment = resolve;
      })
    );
    const capability = 'a'.repeat(64);
    const registration = {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      source: 'shipped' as const,
      grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
      webContentsId: 7,
    };
    const registry = new Map([[capability, registration]]);
    fakeEvent.sender.id = 7;
    const { loadSettings } = await import('./settings');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [productConsentKey('shipped', 'examplectl', ['project', 'list'])]: true,
      },
    });

    const commandPromise = handleRunCommand(
      fakeEvent,
      {
        id: 'capability-id',
        command: 'examplectl',
        args: ['project', 'list'],
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      registry
    );
    await Promise.resolve();
    registry.clear();
    resolveEnvironment(shellEnvironment);
    await commandPromise;

    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'capability-id', -2]]);
  });

  it.each([
    ['different arguments', 7, ['project', 'delete']],
    ['different renderer', 8, ['project', 'list']],
  ])('rejects a capability used with %s', async (_name, senderId, args) => {
    const capability = 'a'.repeat(64);
    fakeEvent.sender.id = senderId;
    await handleRunCommand(
      fakeEvent,
      {
        id: 'capability-id',
        command: 'examplectl',
        args,
        options: {},
        permissionSecrets: {},
        capability,
      },
      { id: 1 } as any,
      {},
      new Map([
        [
          capability,
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'shipped' as const,
            grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
            webContentsId: 7,
          },
        ],
      ])
    );

    expect(spawnMock).not.toHaveBeenCalled();
    expect(sentMessages).toEqual([['command-exit', 'capability-id', -2]]);
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

  it('imports the script when path is inside the app-owned prepared directory', () =>
    testScriptImport('/plugins/prepared/run-id/my-script.js'));

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

  it('removes v2 consent only for the uninstalled package and bundle', async () => {
    const { loadSettings, saveSettings } = await import('./settings');
    const removedKey = `run-command-consent:v2:${JSON.stringify([
      {
        source: 'user',
        packageName: '@example/plugin',
        bundleName: 'example-plugin',
      },
      'minikube',
      ['status'],
    ])}`;
    const retainedKey = removedKey.replace('example-plugin', 'other-bundle');
    vi.mocked(loadSettings).mockReturnValueOnce({
      confirmedCommands: {
        [removedKey]: true,
        [retainedKey]: true,
        'run-command-consent:v2:invalid-json': true,
      },
    });
    vi.mocked(saveSettings).mockClear();

    removeRunCmdConsent('@example/plugin', 'example-plugin');

    const savedSettings = vi.mocked(saveSettings).mock.calls[0][1] as any;
    expect(savedSettings.confirmedCommands[removedKey]).toBeUndefined();
    expect(savedSettings.confirmedCommands[retainedKey]).toBe(true);
    expect(savedSettings.confirmedCommands['run-command-consent:v2:invalid-json']).toBe(true);
  });
});

describe('setupRunCmdHandlers', () => {
  it('does not register handlers without a main window', () => {
    const ipcMain = { on: vi.fn() } as any;

    setupRunCmdHandlers(null, ipcMain);

    expect(ipcMain.on).not.toHaveBeenCalled();
  });

  it('sends permission secrets once per trusted main-frame navigation', () => {
    const ipcHandlers = new Map<string, (...args: any[]) => void>();
    const webContentsHandlers = new Map<string, (...args: any[]) => void>();
    const send = vi.fn();
    const mainFrame = { url: 'https://headlamp.test/' };
    const mainWindow = {
      webContents: {
        id: 7,
        mainFrame,
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          webContentsHandlers.set(event, handler);
        }),
        send,
      },
      on: vi.fn(),
    } as any;
    const ipcMain = {
      on: vi.fn((channel: string, handler: (...args: any[]) => void) => {
        ipcHandlers.set(channel, handler);
      }),
      handle: vi.fn(),
      removeAllListeners: vi.fn(),
      removeHandler: vi.fn(),
    } as any;

    setupRunCmdHandlers(mainWindow, ipcMain, [], 'https://headlamp.test/');
    webContentsHandlers.get('did-frame-navigate')!({}, 'https://headlamp.test/', 200, 'OK', true);
    const requestSecrets = ipcHandlers.get('request-plugin-permission-secrets')!;
    requestSecrets();
    requestSecrets();
    webContentsHandlers.get('did-frame-navigate')!({}, 'https://headlamp.test/', 200, 'OK', false);
    requestSecrets();
    webContentsHandlers.get('did-start-navigation')!({}, 'https://headlamp.test/', false, true);
    requestSecrets();
    webContentsHandlers.get('did-frame-navigate')!({}, 'https://headlamp.test/', 200, 'OK', true);
    requestSecrets();

    expect(send).toHaveBeenCalledTimes(2);
    expect(ipcHandlers.has('run-command')).toBe(true);
    expect(ipcMain.handle).toHaveBeenCalledWith(
      'register-plugin-command-capabilities',
      expect.any(Function)
    );
  });

  it.each([
    ['packaged default', false, false, 0],
    ['packaged opt-in', false, true, 1],
    ['Electron development mode', true, false, 1],
  ])('issues development capabilities for %s', async (_name, isDevelopment, enabled, expected) => {
    const pluginSource = 'console.log("development");';
    const sourceDigest = crypto.createHash('sha256').update(pluginSource).digest('hex');
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-development-gate-'));
    const bundleRoot = path.join(pluginRoot, 'example-plugin');
    fs.mkdirSync(bundleRoot);
    fs.writeFileSync(path.join(bundleRoot, 'package.json'), '{"name":"@example/plugin"}');
    fs.writeFileSync(path.join(bundleRoot, 'main.js'), pluginSource);
    const invokeHandlers = new Map<string, (...args: any[]) => any>();
    const webContents = {
      id: 7,
      mainFrame: { url: 'https://headlamp.test/' },
      on: vi.fn(),
      send: vi.fn(),
    };
    const mainWindow = { webContents, on: vi.fn() } as any;
    const ipcMain = {
      on: vi.fn(),
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        invokeHandlers.set(channel, handler);
      }),
      off: vi.fn(),
      removeHandler: vi.fn(),
    } as any;

    setupRunCmdHandlers(
      mainWindow,
      ipcMain,
      [
        {
          bundleName: 'example-plugin',
          packageName: '@example/plugin',
          source: 'development',
          grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
        },
      ],
      undefined,
      { development: pluginRoot, user: pluginRoot, shipped: pluginRoot },
      isDevelopment,
      () => enabled
    );
    const capabilities = await invokeHandlers.get('register-plugin-command-capabilities')!(
      { sender: webContents, senderFrame: webContents.mainFrame },
      [
        {
          bundleName: 'example-plugin',
          packageName: '@example/plugin',
          path: 'plugins/example-plugin',
          source: 'development',
          type: 'development',
          sourceDigest,
        },
      ]
    );

    expect(capabilities).toHaveLength(expected);
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  });

  it.each(['main-frame navigation', 'window close', 'explicit revocation'])(
    'revokes capabilities on %s',
    async lifecycle => {
      spawnMock.mockClear();
      const pluginSource = 'console.log("shipped");';
      const sourceDigest = crypto.createHash('sha256').update(pluginSource).digest('hex');
      const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-command-register-'));
      const ipcHandlers = new Map<string, (...args: any[]) => any>();
      const invokeHandlers = new Map<string, (...args: any[]) => any>();
      const webContentsHandlers = new Map<string, (...args: any[]) => void>();
      let closeHandler: () => void = () => {};
      const sent: unknown[][] = [];
      const mainFrame = { url: 'https://headlamp.test/' };
      const webContents = {
        id: 7,
        mainFrame,
        on: vi.fn((event: string, handler: (...args: any[]) => void) => {
          webContentsHandlers.set(event, handler);
        }),
        send: vi.fn(),
      };
      const mainWindow = {
        webContents,
        on: vi.fn((_event: string, handler: typeof closeHandler) => {
          closeHandler = handler;
        }),
      } as any;
      const ipcMain = {
        on: vi.fn((channel: string, handler: (...args: any[]) => any) => {
          ipcHandlers.set(channel, handler);
        }),
        handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
          invokeHandlers.set(channel, handler);
        }),
        removeAllListeners: vi.fn(),
        removeHandler: vi.fn(),
      } as any;
      setupRunCmdHandlers(
        mainWindow,
        ipcMain,
        [
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            source: 'shipped',
            grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
          },
        ],
        'https://headlamp.test/',
        {
          development: pluginRoot,
          user: pluginRoot,
          shipped: pluginRoot,
        }
      );
      webContentsHandlers.get('did-frame-navigate')!({}, 'https://headlamp.test/', 200, 'OK', true);
      const bundleRoot = path.join(pluginRoot, 'example-plugin');
      fs.mkdirSync(bundleRoot);
      fs.writeFileSync(path.join(bundleRoot, 'package.json'), '{"name":"@example/plugin"}');
      fs.writeFileSync(path.join(bundleRoot, 'main.js'), pluginSource);
      const capabilities = await invokeHandlers.get('register-plugin-command-capabilities')!(
        { sender: webContents, senderFrame: mainFrame },
        [
          {
            bundleName: 'example-plugin',
            packageName: '@example/plugin',
            path: 'static-plugins/example-plugin',
            source: 'shipped',
            type: 'shipped',
            sourceDigest,
          },
        ]
      );

      if (lifecycle === 'main-frame navigation') {
        webContentsHandlers.get('did-start-navigation')!(
          {},
          'https://elsewhere.test/',
          false,
          true
        );
      } else if (lifecycle === 'window close') {
        closeHandler();
      } else {
        revokeRunCmdCapabilities(ipcMain);
      }
      await ipcHandlers.get('run-command')!(
        {
          sender: { ...webContents, send: (...message: unknown[]) => sent.push(message) },
          senderFrame: mainFrame,
        },
        {
          id: 'stale-id',
          command: 'examplectl',
          args: ['project', 'list'],
          options: {},
          permissionSecrets: {},
          capability: capabilities[0].capability,
        }
      );

      expect(spawnMock).not.toHaveBeenCalled();
      expect(sent).toEqual([['command-exit', 'stale-id', -2]]);
      fs.rmSync(pluginRoot, { recursive: true, force: true });
    }
  );

  it('rejects subframe registration and replaces an existing invoke handler', async () => {
    const invokeHandlers = new Map<string, (...args: any[]) => any>();
    const webContentsHandlers = new Map<string, (...args: any[]) => void>();
    const mainFrame = { url: 'https://headlamp.test/' };
    const webContents = {
      id: 7,
      mainFrame,
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        webContentsHandlers.set(event, handler);
      }),
      send: vi.fn(),
    };
    const mainWindow = { webContents, on: vi.fn() } as any;
    const ipcMain = {
      on: vi.fn(),
      handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
        if (invokeHandlers.has(channel)) {
          throw new Error('duplicate handler');
        }
        invokeHandlers.set(channel, handler);
      }),
      off: vi.fn(),
      removeAllListeners: vi.fn(),
      removeHandler: vi.fn((channel: string) => invokeHandlers.delete(channel)),
    } as any;
    const policies = [
      {
        bundleName: 'example-plugin',
        packageName: '@example/plugin',
        source: 'shipped' as const,
        grants: [{ tool: 'examplectl', args: ['project', 'list'] }],
      },
    ];

    setupRunCmdHandlers(mainWindow, ipcMain, policies, 'https://headlamp.test/');
    webContentsHandlers.get('did-frame-navigate')!({}, 'https://headlamp.test/', 200, 'OK', true);
    const register = invokeHandlers.get('register-plugin-command-capabilities')!;
    const registrations = [
      {
        bundleName: 'example-plugin',
        packageName: '@example/plugin',
        path: 'static-plugins/example-plugin',
        source: 'shipped',
        type: 'shipped',
      },
    ];

    expect(
      await register(
        { sender: webContents, senderFrame: { url: 'https://headlamp.test/' } },
        registrations
      )
    ).toEqual([]);
    expect(() =>
      setupRunCmdHandlers(mainWindow, ipcMain, policies, 'https://headlamp.test/')
    ).not.toThrow();
    expect(ipcMain.off).toHaveBeenCalledWith(
      'request-plugin-permission-secrets',
      expect.any(Function)
    );
    expect(ipcMain.off).toHaveBeenCalledWith('run-command', expect.any(Function));
    expect(ipcMain.removeAllListeners).not.toHaveBeenCalled();
    expect(ipcMain.removeHandler).toHaveBeenCalledWith('register-plugin-command-capabilities');
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
