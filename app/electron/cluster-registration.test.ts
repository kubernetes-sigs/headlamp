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

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import yaml from 'yaml';

const mocks = vi.hoisted(() => ({
  getShellEnvironment: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('cross-spawn', () => ({ default: mocks.spawn }));
vi.mock('./main', () => ({ getShellEnvironment: mocks.getShellEnvironment }));

import {
  ClusterRegistrationProvider,
  ClusterRegistrationResult,
  ClusterRegistrationRuntime,
  enforcePrivateDirectoryPermissions,
  enforcePrivateFilePermissions,
  getExecutablePaths,
  isAzureClusterRegistrationOptions,
  isClusterRegistrationRequest,
  mergeKubeconfig,
  mergeKubeconfigTransaction,
  registerAzureCluster,
  registerCluster,
  replaceFileAtomically,
  resolveClusterRegistrationRuntime,
  resolveKubeconfigPaths,
  setupClusterRegistrationHandler,
  validateGeneratedKubeconfig,
  writeKubeconfigAtomically,
} from './cluster-registration';

const azureRuntime: ClusterRegistrationRuntime = {
  resourcesPath: '/resources',
  tools: {
    cli: '/resources/product-tools/az',
    python: '/resources/product-tools/python',
    kubelogin: '/resources/product-tools/az-kubelogin.py',
  },
};

function kubeconfig(server: string, token = 'token'): string {
  return yaml.stringify({
    apiVersion: 'v1',
    clusters: [{ name: 'shared', cluster: { server } }],
    contexts: [{ name: 'shared', context: { cluster: 'shared', user: 'shared' } }],
    users: [{ name: 'shared', user: { token } }],
    'current-context': 'shared',
  });
}

function mockCommand(
  code: number,
  options: {
    stderr?: string;
    writeConfig?: (filename: string) => void;
    observeArgs?: (args: string[]) => void;
  } = {}
): void {
  mocks.spawn.mockImplementation((_command: string, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
    });
    queueMicrotask(() => {
      options.observeArgs?.(args);
      const outputFile = args[args.indexOf('--file') + 1];
      options.writeConfig?.(outputFile);
      if (options.stderr) {
        child.stderr.emit('data', Buffer.from(options.stderr));
      }
      child.emit('close', code);
    });
    return child;
  });
}

describe('cluster registration providers', () => {
  let directory: string;
  let originalKubeconfig: string | undefined;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'headlamp-aks-cluster-test-'));
    originalKubeconfig = process.env.KUBECONFIG;
    process.env.KUBECONFIG = path.join(directory, 'config');
    mocks.getShellEnvironment.mockReset();
    mocks.getShellEnvironment.mockResolvedValue({ PATH: '/usr/bin' });
    mocks.spawn.mockReset();
  });

  afterEach(() => {
    if (originalKubeconfig === undefined) {
      delete process.env.KUBECONFIG;
    } else {
      process.env.KUBECONFIG = originalKubeconfig;
    }
    fs.rmSync(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('uses product-resolved Azure executable paths', () => {
    expect(getExecutablePaths(azureRuntime)).toEqual({
      pythonCmd: '/resources/product-tools/python',
      azKubeloginPath: '/resources/product-tools/az-kubelogin.py',
      azCliBinPath: '/resources/product-tools',
      azCliCmd: '/resources/product-tools/az',
    });
  });

  it('resolves provider roles through platform-specific external-tool records', () => {
    const resourcesPath = path.join(directory, 'resources');
    const toolPath = path.join(resourcesPath, 'tools', 'examplectl');
    fs.mkdirSync(path.dirname(toolPath), { recursive: true });
    fs.writeFileSync(toolPath, 'example tool');
    const sha256 = createHash('sha256').update('example tool').digest('hex');
    expect(
      resolveClusterRegistrationRuntime(
        {
          'external-tools': [
            {
              id: 'cli',
              platforms: { [process.platform]: { path: 'tools/examplectl', sha256 } },
            },
          ],
        },
        { id: 'example', type: 'example', tools: { cli: 'cli' } },
        resourcesPath
      )
    ).toEqual({ resourcesPath, tools: { cli: fs.realpathSync(toolPath) } });
  });

  it('hashes external tools in bounded chunks', () => {
    const resourcesPath = path.join(directory, 'resources');
    const toolPath = path.join(resourcesPath, 'tools', 'large-examplectl');
    fs.mkdirSync(path.dirname(toolPath), { recursive: true });
    const contents = Buffer.alloc(256 * 1024, 7);
    fs.writeFileSync(toolPath, contents);
    const sha256 = createHash('sha256').update(contents).digest('hex');
    const read = vi.spyOn(fs, 'readSync');

    expect(
      resolveClusterRegistrationRuntime(
        {
          'external-tools': [
            {
              id: 'cli',
              platforms: { [process.platform]: { path: 'tools/large-examplectl', sha256 } },
            },
          ],
        },
        { id: 'example', type: 'example', tools: { cli: 'cli' } },
        resourcesPath
      )
    ).toEqual({ resourcesPath, tools: { cli: fs.realpathSync(toolPath) } });
    const readCalls = read.mock.calls as unknown as Array<
      [number, NodeJS.ArrayBufferView, number, number, number | null]
    >;
    expect(readCalls.filter(call => call[3] === 64 * 1024).length).toBeGreaterThan(1);
  });

  it('resolves tool-free providers without external-tool metadata', () => {
    expect(
      resolveClusterRegistrationRuntime(
        {},
        { id: 'cluster-api', type: 'cluster-api', tools: {} },
        '/resources'
      )
    ).toEqual({ resourcesPath: path.resolve('/resources'), tools: {} });
  });

  it('rejects external-tool paths outside packaged resources', () => {
    const resourcesPath = path.join(directory, 'resources');
    fs.mkdirSync(resourcesPath);
    expect(() =>
      resolveClusterRegistrationRuntime(
        {
          'external-tools': [
            {
              id: 'cli',
              platforms: {
                [process.platform]: { path: '../examplectl', sha256: 'a'.repeat(64) },
              },
            },
          ],
        },
        { id: 'example', type: 'example', tools: { cli: 'cli' } },
        resourcesPath
      )
    ).toThrow("External tool 'cli' escapes packaged resources");
  });

  it('updates credentials when a same-name cluster still targets the same API server', () => {
    const merged = mergeKubeconfig(
      kubeconfig('https://shared.example', 'old-token'),
      kubeconfig('https://shared.example', 'new-token')
    );

    expect(merged.clusters).toHaveLength(1);
    expect(merged.contexts).toHaveLength(1);
    expect(merged.users).toEqual([{ name: 'shared', user: { token: 'new-token' } }]);
  });

  it('rejects a same-name cluster that targets another API server', () => {
    expect(() =>
      mergeKubeconfig(kubeconfig('https://managed.example'), kubeconfig('https://arc.example'))
    ).toThrow("Cluster 'shared' already uses a different API server");
  });

  it('rejects changing security fields used by a preserved context', () => {
    const existing = yaml.stringify({
      clusters: [
        {
          name: 'shared',
          cluster: { server: 'https://shared.example', 'certificate-authority-data': 'old' },
        },
      ],
      contexts: [
        { name: 'shared', context: { cluster: 'shared', user: 'shared' } },
        { name: 'preserved', context: { cluster: 'shared', user: 'shared' } },
      ],
      users: [{ name: 'shared', user: { token: 'token' } }],
    });
    const generated = yaml.stringify({
      clusters: [
        {
          name: 'shared',
          cluster: { server: 'https://shared.example', 'certificate-authority-data': 'new' },
        },
      ],
      contexts: [{ name: 'shared', context: { cluster: 'shared', user: 'shared' } }],
      users: [{ name: 'shared', user: { token: 'token' } }],
    });

    expect(() => mergeKubeconfig(existing, generated)).toThrow(
      "Cluster 'shared' is already referenced by another context"
    );
  });

  it('rejects a same-name context with changed identity fields', () => {
    const existing = yaml.parse(kubeconfig('https://shared.example'));
    existing.contexts[0].context.namespace = 'preserved';
    const generated = yaml.parse(kubeconfig('https://shared.example'));
    generated.contexts[0].context.namespace = 'replacement';

    expect(() => mergeKubeconfig(yaml.stringify(existing), yaml.stringify(generated))).toThrow(
      "Context 'shared' already has different configuration"
    );
  });

  it('rejects replacing credentials used by a preserved context', () => {
    const existing = yaml.stringify({
      clusters: [{ name: 'existing', cluster: { server: 'https://existing.example' } }],
      contexts: [{ name: 'existing', context: { cluster: 'existing', user: 'shared' } }],
      users: [{ name: 'shared', user: { token: 'old-token' } }],
    });
    const generated = yaml.stringify({
      clusters: [{ name: 'new', cluster: { server: 'https://new.example' } }],
      contexts: [{ name: 'new', context: { cluster: 'new', user: 'shared' } }],
      users: [{ name: 'shared', user: { token: 'new-token' } }],
    });

    expect(() => mergeKubeconfig(existing, generated)).toThrow(
      "User 'shared' is already referenced by another context"
    );
  });

  it.each(['clusters', 'contexts', 'users'] as const)(
    'rejects duplicate %s names in existing and generated kubeconfigs',
    key => {
      const duplicateEntries = yaml.stringify({
        clusters: [],
        contexts: [],
        users: [],
        [key]: [{ name: 'duplicate' }, { name: 'duplicate' }],
      });

      expect(() => mergeKubeconfig(duplicateEntries, '')).toThrow(
        `Duplicate ${key} name in kubeconfig`
      );
      expect(() => mergeKubeconfig('', duplicateEntries)).toThrow(
        `Duplicate ${key} name in kubeconfig`
      );
    }
  );

  it('atomically replaces an existing kubeconfig and enforces private permissions', () => {
    const destination = process.env.KUBECONFIG as string;
    fs.writeFileSync(destination, 'old', { mode: 0o644 });
    const fsync = vi.spyOn(fs, 'fsyncSync');

    writeKubeconfigAtomically(destination, 'new');

    expect(fs.readFileSync(destination, 'utf8')).toBe('new');
    expect(fsync).toHaveBeenCalledTimes(process.platform === 'win32' ? 1 : 2);
    if (process.platform !== 'win32') {
      expect(fs.statSync(destination).mode & 0o777).toBe(0o600);
    }
    expect(fs.readdirSync(directory)).toEqual(['config']);
  });

  it.runIf(process.platform !== 'win32')(
    'keeps a visible replacement successful when directory fsync fails',
    () => {
      const destination = process.env.KUBECONFIG as string;
      fs.writeFileSync(destination, 'old');
      const fsync = vi.spyOn(fs, 'fsyncSync');
      fsync
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new Error('directory sync failed');
        });
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => writeKubeconfigAtomically(destination, 'new')).not.toThrow();

      expect(fs.readFileSync(destination, 'utf8')).toBe('new');
      expect(consoleError).toHaveBeenCalledWith(
        '[AKS] Kubeconfig replaced but parent directory sync failed'
      );
    }
  );

  it('preserves the existing kubeconfig when atomic replacement fails', () => {
    const destination = process.env.KUBECONFIG as string;
    fs.writeFileSync(destination, 'old');
    const failReplacement = () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };

    expect(() => writeKubeconfigAtomically(destination, 'new', failReplacement)).toThrow(
      'disk full'
    );
    expect(fs.readFileSync(destination, 'utf8')).toBe('old');
    expect(fs.readdirSync(directory)).toEqual(['config']);
  });

  it('uses MoveFileExW to replace an existing Windows destination', () => {
    const runUtility = vi.fn((command: string, args: readonly string[]) => {
      void command;
      void args;
      return '';
    });
    const source = "C:\\shared path\\config's.tmp";
    const destination = "C:\\shared path\\config's";

    replaceFileAtomically(source, destination, 'win32', runUtility);

    expect(runUtility).toHaveBeenCalledWith('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      expect.any(String),
    ]);
    const encodedScript = runUtility.mock.calls[0]?.[1][4] ?? '';
    const script = Buffer.from(encodedScript, 'base64').toString('utf16le');
    expect(script).toMatch(/MoveFileExW[\s\S]*MoveFileEx\(\$sourcePath, \$destinationPath, 9\)/);
    expect(script).toContain(Buffer.from(source).toString('base64'));
    expect(script).toContain(Buffer.from(destination).toString('base64'));
    expect(script).not.toContain(source);
    expect(script).not.toContain(destination);
  });

  it.runIf(process.platform === 'win32')('replaces an existing Windows kubeconfig', () => {
    const destination = process.env.KUBECONFIG as string;
    fs.writeFileSync(destination, 'old');

    writeKubeconfigAtomically(destination, 'new');

    expect(fs.readFileSync(destination, 'utf8')).toBe('new');
  });

  it.runIf(process.platform !== 'win32')('preserves a kubeconfig symlink', () => {
    const destination = process.env.KUBECONFIG as string;
    const target = path.join(directory, 'target-config');
    fs.writeFileSync(target, 'old');
    fs.symlinkSync(target, destination);

    writeKubeconfigAtomically(destination, 'new');

    expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(destination)).toBe(target);
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
  });

  it.runIf(process.platform !== 'win32')('rejects a dangling kubeconfig symlink', () => {
    const destination = process.env.KUBECONFIG as string;
    fs.symlinkSync(path.join(directory, 'missing-config'), destination);

    expect(() => writeKubeconfigAtomically(destination, 'new')).toThrow();
    expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
  });

  it('applies an owner-only Windows ACL before replacement', () => {
    const runUtility = vi.fn((command: string) =>
      command === 'whoami' ? 'example\\developer\r\n' : ''
    );

    enforcePrivateFilePermissions('C:\\shared\\config.tmp', 'win32', runUtility);

    expect(runUtility).toHaveBeenNthCalledWith(1, 'whoami', []);
    expect(runUtility).toHaveBeenNthCalledWith(2, 'icacls', [
      'C:\\shared\\config.tmp',
      '/inheritance:r',
      '/grant:r',
      'example\\developer:(F)',
    ]);
  });

  it('hardens an empty credential file before writing contents', () => {
    const destination = process.env.KUBECONFIG as string;
    const hardenFile = vi.fn((temporaryPath: string) => {
      expect(fs.statSync(temporaryPath).size).toBe(0);
    });
    const replaceFile = (sourcePath: string, destinationPath: string) => {
      fs.renameSync(sourcePath, destinationPath);
    };

    writeKubeconfigAtomically(destination, 'secret contents', replaceFile, 'win32', hardenFile);

    expect(hardenFile).toHaveBeenCalledOnce();
    expect(fs.readFileSync(destination, 'utf8')).toBe('secret contents');
  });

  it('applies an inheritable owner-only Windows ACL before credential generation', () => {
    const runUtility = vi.fn((command: string) =>
      command === 'whoami' ? 'example\\developer\r\n' : ''
    );

    enforcePrivateDirectoryPermissions('C:\\shared\\credentials', 'win32', runUtility);

    expect(runUtility).toHaveBeenNthCalledWith(1, 'whoami', []);
    expect(runUtility).toHaveBeenNthCalledWith(2, 'icacls', [
      'C:\\shared\\credentials',
      '/inheritance:r',
      '/grant:r',
      'example\\developer:(OI)(CI)F',
    ]);
  });

  it('returns a failure and removes the temporary directory when hardening fails', async () => {
    const createTemporaryDirectory = fs.mkdtempSync.bind(fs);
    let temporaryDirectory = '';
    vi.spyOn(fs, 'mkdtempSync').mockImplementationOnce(prefix => {
      temporaryDirectory = createTemporaryDirectory(prefix);
      return temporaryDirectory;
    });
    const hardenCredentialDirectory = vi.fn(() => {
      throw new Error('permission hardening failed');
    });

    await expect(
      registerAzureCluster(
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'cluster',
          isAzureRBACEnabled: false,
        },
        azureRuntime,
        hardenCredentialDirectory
      )
    ).resolves.toEqual({ success: false, message: 'permission hardening failed' });
    expect(hardenCredentialDirectory).toHaveBeenCalledWith(temporaryDirectory);
    expect(fs.existsSync(temporaryDirectory)).toBe(false);
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('keeps a committed registration successful when temporary cleanup fails', async () => {
    mockCommand(0, {
      writeConfig(filename) {
        fs.writeFileSync(filename, kubeconfig('https://shared.example'));
      },
    });
    let temporaryDirectory = '';
    const cleanup = vi.fn((directoryPath: string) => {
      temporaryDirectory = directoryPath;
      throw new Error('cleanup failed');
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      registerAzureCluster(
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'shared',
          isAzureRBACEnabled: false,
        },
        azureRuntime,
        enforcePrivateDirectoryPermissions,
        cleanup
      )
    ).resolves.toMatchObject({ success: true });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith(
      '[AKS] Temporary credential cleanup failed after registration committed'
    );
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it.each([
    ['', 'Generated kubeconfig has no current context'],
    ['{}', 'Generated kubeconfig has no current context'],
    [
      yaml.stringify({
        clusters: [{ name: 'cluster', cluster: { server: 'https://cluster.example' } }],
        contexts: [{ name: 'cluster', context: { cluster: 'cluster', user: 'missing' } }],
        users: [],
        'current-context': 'cluster',
      }),
      "Generated kubeconfig user 'missing' is missing",
    ],
  ])('rejects incoherent generated credentials', (generated, message) => {
    expect(() => validateGeneratedKubeconfig(generated)).toThrow(message);
  });

  it('rejects a generated user whose auth data is not an object', () => {
    const config = yaml.parse(kubeconfig('https://shared.example'));
    config.users[0].user = 'invalid';
    expect(() => validateGeneratedKubeconfig(yaml.stringify(config))).toThrow(
      "Generated kubeconfig user 'shared' is missing"
    );
  });

  it.each([
    [
      'clusters',
      {
        clusters: [
          { name: 'cluster', cluster: { server: 'https://cluster.example' } },
          { name: 'extra', cluster: { server: 'https://extra.example' } },
        ],
      },
    ],
    [
      'contexts',
      {
        contexts: [
          { name: 'cluster', context: { cluster: 'cluster', user: 'cluster' } },
          { name: 'extra', context: { cluster: 'cluster', user: 'cluster' } },
        ],
      },
    ],
    [
      'users',
      {
        users: [
          { name: 'cluster', user: { token: 'token' } },
          { name: 'extra', user: { token: 'extra' } },
        ],
      },
    ],
  ])('rejects unrelated generated %s', (collection, override) => {
    const config = yaml.parse(kubeconfig('https://cluster.example'));
    config.clusters[0].name = 'cluster';
    config.contexts[0] = { name: 'cluster', context: { cluster: 'cluster', user: 'cluster' } };
    config.users[0].name = 'cluster';
    config['current-context'] = 'cluster';

    expect(() => validateGeneratedKubeconfig(yaml.stringify({ ...config, ...override }))).toThrow(
      `Generated kubeconfig contains unrelated ${collection}`
    );
  });

  it('rejects empty generated authentication data', () => {
    const config = yaml.parse(kubeconfig('https://shared.example'));
    config.users[0].user = {};
    expect(() => validateGeneratedKubeconfig(yaml.stringify(config))).toThrow(
      "Generated kubeconfig user 'shared' is missing"
    );
  });

  it.each([' https://shared.example ', 'https://user:password@shared.example'])(
    'rejects unsafe generated API server %s',
    server => {
      expect(() => validateGeneratedKubeconfig(kubeconfig(server))).toThrow(
        "Generated kubeconfig cluster 'shared' has invalid API server"
      );
    }
  );

  it('rejects a collision found only in a later KUBECONFIG entry', async () => {
    const destination = path.join(directory, 'new-config');
    const preserved = path.join(directory, 'preserved-config');
    process.env.KUBECONFIG = [destination, preserved].join(path.delimiter);
    fs.writeFileSync(preserved, kubeconfig('https://preserved.example'));
    mockCommand(0, {
      writeConfig(filename) {
        fs.writeFileSync(filename, kubeconfig('https://generated.example'));
      },
    });

    await expect(
      registerCluster(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'shared',
          isAzureRBACEnabled: false,
        },
        azureRuntime
      )
    ).resolves.toEqual({
      success: false,
      message: "Cluster 'shared' already uses a different API server",
    });
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readFileSync(preserved, 'utf8')).toBe(kubeconfig('https://preserved.example'));
  });

  it('rejects a collision whose cluster and preserved context are split across files', async () => {
    const destination = path.join(directory, 'new-config');
    const clusterPath = path.join(directory, 'cluster-config');
    const contextPath = path.join(directory, 'context-config');
    process.env.KUBECONFIG = [destination, clusterPath, contextPath].join(path.delimiter);
    fs.writeFileSync(
      clusterPath,
      yaml.stringify({
        clusters: [
          {
            name: 'shared',
            cluster: { server: 'https://shared.example', 'certificate-authority-data': 'old' },
          },
        ],
      })
    );
    fs.writeFileSync(
      contextPath,
      yaml.stringify({
        contexts: [{ name: 'preserved', context: { cluster: 'shared', user: 'preserved' } }],
        users: [{ name: 'preserved', user: { token: 'preserved' } }],
      })
    );
    const generated = yaml.parse(kubeconfig('https://shared.example'));
    generated.clusters[0].cluster['certificate-authority-data'] = 'new';
    mockCommand(0, {
      writeConfig(filename) {
        fs.writeFileSync(filename, yaml.stringify(generated));
      },
    });

    await expect(
      registerCluster(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'shared',
          isAzureRBACEnabled: false,
        },
        azureRuntime
      )
    ).resolves.toEqual({
      success: false,
      message: "Cluster 'shared' is already referenced by another context",
    });
    expect(fs.existsSync(destination)).toBe(false);
  });

  it('rejects a user collision whose credentials and preserved context are split across files', async () => {
    const destination = path.join(directory, 'new-config');
    const contextPath = path.join(directory, 'context-config');
    const userPath = path.join(directory, 'user-config');
    process.env.KUBECONFIG = [destination, contextPath, userPath].join(path.delimiter);
    fs.writeFileSync(
      contextPath,
      yaml.stringify({
        clusters: [{ name: 'preserved-cluster', cluster: { server: 'https://preserved.example' } }],
        contexts: [
          {
            name: 'preserved',
            context: { cluster: 'preserved-cluster', user: 'shared' },
          },
        ],
      })
    );
    fs.writeFileSync(
      userPath,
      yaml.stringify({ users: [{ name: 'shared', user: { token: 'old-token' } }] })
    );
    mockCommand(0, {
      writeConfig(filename) {
        fs.writeFileSync(filename, kubeconfig('https://shared.example', 'new-token'));
      },
    });

    await expect(
      registerCluster(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'shared',
          isAzureRBACEnabled: false,
        },
        azureRuntime
      )
    ).resolves.toEqual({
      success: false,
      message: "User 'shared' is already referenced by another context",
    });
    expect(fs.existsSync(destination)).toBe(false);
  });

  it.each([
    {
      name: 'managed AKS',
      managedNamespace: undefined,
      clusterType: 'aks' as const,
      expectedArgs: [
        'aks',
        'get-credentials',
        '--subscription',
        'subscription',
        '--resource-group',
        'resource-group',
        '--name',
        'cluster',
      ],
    },
    {
      name: 'Arc-connected',
      managedNamespace: undefined,
      clusterType: 'aksarc' as const,
      expectedArgs: [
        'aksarc',
        'get-credentials',
        '--subscription',
        'subscription',
        '--resource-group',
        'resource-group',
        '--name',
        'cluster',
      ],
    },
    {
      name: 'managed namespace',
      managedNamespace: 'namespace',
      clusterType: 'aks' as const,
      expectedArgs: [
        'aks',
        'namespace',
        'get-credentials',
        '--cluster-name',
        'cluster',
        '--resource-group',
        'resource-group',
        '--name',
        'namespace',
        '--subscription',
        'subscription',
      ],
    },
  ])('registers $name credentials successfully', async testCase => {
    let observedArgs: string[] = [];
    const generated = yaml
      .stringify({
        clusters: [{ name: 'cluster', cluster: { server: 'https://cluster.example' } }],
        contexts: [{ name: 'cluster', context: { cluster: 'cluster', user: 'cluster' } }],
        users: [{ name: 'cluster', user: { exec: { command: 'kubelogin' } } }],
        'current-context': 'cluster',
      })
      .replace('command: kubelogin', 'command: "kubelogin"');
    mockCommand(0, {
      observeArgs(args) {
        observedArgs = args;
      },
      writeConfig(filename) {
        fs.writeFileSync(filename, generated);
      },
    });

    await expect(
      registerCluster(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'cluster',
          isAzureRBACEnabled: false,
          managedNamespace: testCase.managedNamespace,
          clusterType: testCase.clusterType,
        },
        azureRuntime
      )
    ).resolves.toMatchObject({ success: true });

    expect(observedArgs.slice(0, -2)).toEqual(testCase.expectedArgs);
    expect(mocks.spawn).toHaveBeenCalledWith(
      azureRuntime.tools.cli,
      expect.any(Array),
      expect.any(Object)
    );
    expect(observedArgs.at(-2)).toBe('--file');
    expect(observedArgs.at(-1)).toContain('headlamp-kubeconfig-');
    const destination = process.env.KUBECONFIG as string;
    const result = yaml.parse(fs.readFileSync(destination, 'utf8'));
    expect(result['current-context']).toBe('cluster');
    expect(result.users[0].user.exec.command).toBe(getExecutablePaths(azureRuntime).pythonCmd);
    if (process.platform !== 'win32') {
      expect(fs.statSync(destination).mode & 0o777).toBe(0o600);
    }
  });

  it('serializes concurrent registrations for the same destination', async () => {
    const generated = (clusterName: string) =>
      yaml.stringify({
        clusters: [{ name: clusterName, cluster: { server: `https://${clusterName}.example` } }],
        contexts: [{ name: clusterName, context: { cluster: clusterName, user: clusterName } }],
        users: [{ name: clusterName, user: { token: `${clusterName}-token` } }],
        'current-context': clusterName,
      });
    const destination = process.env.KUBECONFIG as string;

    await Promise.all([
      mergeKubeconfigTransaction(generated('first'), [destination]),
      mergeKubeconfigTransaction(generated('second'), [destination]),
    ]);
    const result = yaml.parse(fs.readFileSync(destination, 'utf8'));
    expect(result.clusters.map((cluster: { name: string }) => cluster.name).sort()).toEqual([
      'first',
      'second',
    ]);
  });

  it('preserves a malformed destination and removes the temporary kubeconfig', async () => {
    const destination = process.env.KUBECONFIG as string;
    const secret = 'SUPER_SECRET_KUBECONFIG_TOKEN';
    const malformed = `users:\n- name: leaked\n  user:\n    token: ${secret}\nclusters: [`;
    fs.writeFileSync(destination, malformed);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let temporaryFile = '';
    mockCommand(0, {
      writeConfig(filename) {
        temporaryFile = filename;
        fs.writeFileSync(filename, kubeconfig('https://new.example'));
      },
    });

    const result = await registerCluster(
      'azure',
      {
        subscriptionId: 'subscription',
        resourceGroup: 'resource-group',
        clusterName: 'shared',
        isAzureRBACEnabled: false,
      },
      azureRuntime
    );
    expect(result).toEqual({
      success: false,
      message: 'Failed to parse KUBECONFIG entry 1 kubeconfig',
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
    expect(fs.readFileSync(destination, 'utf8')).toBe(malformed);
    expect(fs.existsSync(temporaryFile)).toBe(false);
  });

  it('removes a partial temporary kubeconfig when Azure CLI fails', async () => {
    let temporaryFile = '';
    let temporaryDirectoryMode = 0;
    const secret = 'SUPER_SECRET_AZURE_DIAGNOSTIC';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCommand(1, {
      stderr: secret,
      writeConfig(filename) {
        temporaryFile = filename;
        temporaryDirectoryMode = fs.statSync(path.dirname(filename)).mode & 0o777;
        fs.writeFileSync(filename, 'partial');
      },
    });

    await expect(
      registerCluster(
        'azure',
        {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'shared',
          isAzureRBACEnabled: false,
        },
        azureRuntime
      )
    ).resolves.toEqual({
      success: false,
      message: 'Failed to get cluster credentials.',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[AKS] Azure CLI credential retrieval failed with exit code 1'
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
    if (process.platform !== 'win32') {
      expect(temporaryDirectoryMode).toBe(0o700);
    }
    expect(fs.existsSync(temporaryFile)).toBe(false);
    expect(fs.existsSync(path.dirname(temporaryFile))).toBe(false);
    expect(fs.existsSync(process.env.KUBECONFIG as string)).toBe(false);
  });

  it('accepts only complete cluster registration IPC requests', () => {
    expect(
      isClusterRegistrationRequest({
        provider: 'azure',
        options: {
          subscriptionId: 'subscription',
          resourceGroup: 'resource-group',
          clusterName: 'cluster',
          isAzureRBACEnabled: false,
          clusterType: 'aksarc',
        },
        capabilitySecret: 'a'.repeat(64),
      })
    ).toBe(true);

    for (const request of [
      null,
      [],
      {},
      {
        provider: 'azure',
        options: {},
        capabilitySecret: 'guessable',
      },
      {
        provider: ' azure ',
        options: {},
        capabilitySecret: 'a'.repeat(64),
      },
    ]) {
      expect(isClusterRegistrationRequest(request)).toBe(false);
    }
  });

  it.each([
    {
      subscriptionId: '',
      resourceGroup: 'group',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
    },
    {
      subscriptionId: 'subscription',
      resourceGroup: 'group',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
      managedNamespace: '',
    },
    {
      subscriptionId: 'subscription',
      resourceGroup: 'group',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
      clusterType: 'other',
    },
    {
      subscriptionId: 'subscription',
      resourceGroup: 'group',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
      clusterType: 'aksarc',
      managedNamespace: 'namespace',
    },
    {
      subscriptionId: 'subscription',
      resourceGroup: 'group',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
      unexpected: true,
    },
    {
      subscriptionId: ' subscription ',
      resourceGroup: 'group',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
    },
    {
      subscriptionId: 'subscription',
      resourceGroup: 'group\nforged',
      clusterName: 'cluster',
      isAzureRBACEnabled: false,
    },
  ])('rejects invalid Azure provider options: %j', options => {
    expect(isAzureClusterRegistrationOptions(options)).toBe(false);
  });

  it('dispatches validated options to an additional registration provider', async () => {
    interface ExampleOptions {
      endpoint: string;
    }
    const provider: ClusterRegistrationProvider<ExampleOptions> = {
      id: 'example',
      validateOptions(options): options is ExampleOptions {
        return (
          typeof options === 'object' &&
          options !== null &&
          !Array.isArray(options) &&
          typeof (options as Record<string, unknown>).endpoint === 'string'
        );
      },
      register: vi.fn().mockResolvedValue({ success: true, message: 'registered' }),
    };
    const runtime = { resourcesPath: '/resources', tools: {} };

    await expect(
      registerCluster('example', { endpoint: 'https://cluster.example' }, runtime, [provider])
    ).resolves.toEqual({ success: true, message: 'registered' });
    expect(provider.register).toHaveBeenCalledWith(
      { endpoint: 'https://cluster.example' },
      runtime
    );
    await expect(registerCluster('example', {}, runtime, [provider])).resolves.toEqual({
      success: false,
      message: "Invalid options for cluster registration provider 'example'.",
    });
    await expect(registerCluster('missing', {}, runtime, [provider])).resolves.toEqual({
      success: false,
      message: "Cluster registration provider 'missing' is unavailable.",
    });
  });

  it('contains malformed, duplicate, and throwing provider implementations', async () => {
    const runtime = { resourcesPath: '/resources', tools: {} };
    const throwingValidator: ClusterRegistrationProvider<Record<string, never>> = {
      id: 'validator',
      validateOptions(options: unknown): options is Record<string, never> {
        throw new Error('validator secret');
      },
      register: async () => ({ success: true, message: 'registered' }),
    };
    const throwingProvider: ClusterRegistrationProvider<Record<string, never>> = {
      id: 'register',
      validateOptions: (options): options is Record<string, never> =>
        typeof options === 'object' && options !== null,
      register: async () => {
        throw new Error('provider secret');
      },
    };
    const malformedProvider: ClusterRegistrationProvider<Record<string, never>> = {
      id: 'malformed',
      validateOptions: (options): options is Record<string, never> =>
        typeof options === 'object' && options !== null,
      register: async () => undefined as never,
    };

    await expect(registerCluster('validator', {}, runtime, [throwingValidator])).resolves.toEqual({
      success: false,
      message: "Invalid options for cluster registration provider 'validator'.",
    });
    await expect(registerCluster('register', {}, runtime, [throwingProvider])).resolves.toEqual({
      success: false,
      message: "Cluster registration provider 'register' failed.",
    });
    await expect(registerCluster('malformed', {}, runtime, [malformedProvider])).resolves.toEqual({
      success: false,
      message: "Cluster registration provider 'malformed' returned an invalid result.",
    });
    await expect(
      registerCluster('register', {}, runtime, [throwingProvider, throwingProvider])
    ).resolves.toEqual({
      success: false,
      message: "Cluster registration provider 'register' is ambiguously configured.",
    });
  });

  it('returns only approved fields from a provider result', async () => {
    const provider: ClusterRegistrationProvider<Record<string, never>> = {
      id: 'extra-fields',
      validateOptions: (options): options is Record<string, never> =>
        typeof options === 'object' && options !== null,
      register: async () =>
        ({
          success: true,
          message: 'registered',
          credential: 'secret',
        } as ClusterRegistrationResult),
    };

    await expect(
      registerCluster('extra-fields', {}, { resourcesPath: '/resources', tools: {} }, [provider])
    ).resolves.toEqual({ success: true, message: 'registered' });
  });

  it('preserves nonempty KUBECONFIG components verbatim', () => {
    const first = `${path.sep}tmp${path.sep} leading`;
    const second = `${path.sep}tmp${path.sep}trailing `;
    expect(resolveKubeconfigPaths([first, '', second].join(path.delimiter))).toEqual([
      first,
      second,
    ]);
  });

  describe('registration IPC handler', () => {
    const startUrl = 'http://localhost:3000';
    const capabilitySecret = 'a'.repeat(64);
    const mainFrame = { url: startUrl };
    const webContents = { mainFrame };
    const mainWindow = { webContents } as any;
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    } as any;
    const provider: ClusterRegistrationProvider<{ endpoint: string }> = {
      id: 'example',
      validateOptions(options): options is { endpoint: string } {
        return (
          typeof options === 'object' &&
          options !== null &&
          typeof (options as Record<string, unknown>).endpoint === 'string'
        );
      },
      register: vi.fn().mockResolvedValue({ success: true, message: 'registered' }),
    };
    const validRequest = {
      provider: 'example',
      options: { endpoint: 'https://cluster.example' },
      capabilitySecret,
    };
    const authorize = vi.fn((_event, providerId, capability) =>
      providerId === 'example' && capability === capabilitySecret
        ? { id: 'example', type: 'example', tools: {} }
        : undefined
    );

    beforeEach(() => {
      handlers.clear();
      mainFrame.url = startUrl;
      vi.mocked(provider.register).mockReset();
      vi.mocked(provider.register).mockResolvedValue({ success: true, message: 'registered' });
      setupClusterRegistrationHandler(
        mainWindow,
        ipcMain,
        authorize,
        { 'external-tools': [] },
        '/resources',
        startUrl,
        [provider]
      );
    });

    it.each([
      ['another sender', { sender: {}, senderFrame: mainFrame }],
      ['a subframe', { sender: webContents, senderFrame: { url: startUrl } }],
    ])('rejects %s', async (_description, event) => {
      await expect(handlers.get('register-cluster')!(event, validRequest)).resolves.toEqual({
        success: false,
        message: 'Cluster registration request was rejected.',
      });
      expect(provider.register).not.toHaveBeenCalled();
    });

    it('rejects the main frame after it navigates away', async () => {
      mainFrame.url = 'https://untrusted.example/';

      await expect(
        handlers.get('register-cluster')!(
          { sender: webContents, senderFrame: mainFrame },
          validRequest
        )
      ).resolves.toEqual({
        success: false,
        message: 'Cluster registration request was rejected.',
      });
    });

    it('rejects a malformed request', async () => {
      await expect(
        handlers.get('register-cluster')!({ sender: webContents, senderFrame: mainFrame }, {})
      ).resolves.toEqual({
        success: false,
        message: 'Invalid cluster registration request.',
      });
      expect(provider.register).not.toHaveBeenCalled();
    });

    it('rejects an incorrect capability', async () => {
      await expect(
        handlers.get('register-cluster')!(
          { sender: webContents, senderFrame: mainFrame },
          {
            ...validRequest,
            capabilitySecret: 'f'.repeat(64),
          }
        )
      ).resolves.toEqual({
        success: false,
        message: 'Cluster registration request was rejected.',
      });
      expect(provider.register).not.toHaveBeenCalled();
    });

    it('dispatches a valid trusted request', async () => {
      await expect(
        handlers.get('register-cluster')!(
          { sender: webContents, senderFrame: mainFrame },
          validRequest
        )
      ).resolves.toEqual({ success: true, message: 'registered' });
      expect(provider.register).toHaveBeenCalledWith(validRequest.options, {
        resourcesPath: path.resolve('/resources'),
        tools: {},
      });
    });
  });
});

describe('cluster registration startup wiring', () => {
  it('installs the handler before loading the renderer', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, 'main.ts'), 'utf8');
    expect(mainSource).toMatch(
      /import \{ setupClusterRegistrationHandler \} from '\.\/cluster-registration';/
    );
    const handlerSetup = mainSource.indexOf('    setupClusterRegistrationHandler(');
    const rendererLoad = mainSource.indexOf('    mainWindow.loadURL(startUrl)');
    expect(handlerSetup).toBeGreaterThan(-1);
    expect(handlerSetup).toBeLessThan(rendererLoad);
    expect(mainSource).not.toContain("await import('./cluster-registration')");
  });
});
