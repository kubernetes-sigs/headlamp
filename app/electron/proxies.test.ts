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

import type { ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerMock, probedPorts, spawnMock } = vi.hoisted(() => ({
  createServerMock: vi.fn(),
  probedPorts: [] as number[],
  spawnMock: vi.fn(),
}));
const PROXY_CAPABILITY = '0123456789abcdef0123456789abcdef';
const createdProxyChildren: ChildProcessWithoutNullStreams[] = [];

vi.mock('child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: spawnMock,
}));

vi.mock('net', () => ({ createServer: createServerMock }));

import {
  buildProxySpawnSpec,
  killAllProxies,
  ManagedProxyProvider,
  sanitizeProxyEnvironment,
  setupManagedProxyHandler,
  setupProxyHandlers,
  StartProxyResult,
} from './proxies';

/** Runs an operation with a temporary process platform value. */
async function withPlatform(platform: NodeJS.Platform, operation: () => Promise<void> | void) {
  const originalPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    await operation();
  } finally {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  }
}

/** Creates a controllable child process stand-in. */
function proxyChild(pid = 4242): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  child.stdout = new EventEmitter() as ChildProcessWithoutNullStreams['stdout'];
  child.stderr = new EventEmitter() as ChildProcessWithoutNullStreams['stderr'];
  child.stdin = new EventEmitter() as ChildProcessWithoutNullStreams['stdin'];
  Object.defineProperty(child, 'pid', { value: pid, configurable: true });
  child.kill = vi.fn();
  createdProxyChildren.push(child);
  return child;
}

/** Creates a controllable local port probe. */
function portProbe(available = true) {
  const server = new EventEmitter() as any;
  server.listen = vi.fn((options: { port: number }, callback: () => void) => {
    probedPorts.push(options.port);
    queueMicrotask(() =>
      available
        ? callback()
        : server.emit('error', Object.assign(new Error('in use'), { code: 'EADDRINUSE' }))
    );
    return server;
  });
  server.close = vi.fn((callback?: () => void) => {
    callback?.();
    return server;
  });
  return server;
}

/** Registers proxy handlers and returns the start handler. */
function startHandler(capabilitySecret = PROXY_CAPABILITY) {
  const handlers: Record<string, (...args: any[]) => Promise<StartProxyResult>> = {};
  const ipcMain = {
    removeHandler: vi.fn((channel: string) => delete handlers[channel]),
    handle: (channel: string, handler: (...args: any[]) => Promise<StartProxyResult>) => {
      handlers[channel] = handler;
    },
  } as unknown as Electron.IpcMain;
  setupProxyHandlers({ id: 1 } as Electron.BrowserWindow, ipcMain, capabilitySecret, async () => ({
    PATH: '/test/bin',
  }));
  return handlers['start-cluster-proxy'];
}

/** Creates an IPC mock that rejects duplicate handlers like Electron. */
function ipcMainMock() {
  const handlers = new Map<string, (...args: any[]) => Promise<StartProxyResult>>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<StartProxyResult>) => {
      if (handlers.has(channel)) {
        throw new Error(`Attempted to register a second handler for '${channel}'`);
      }
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  } as unknown as Electron.IpcMain;
  return { handlers, ipcMain };
}

/** Returns a valid proxy request. */
function proxyRequest(cluster: string, capabilitySecret = PROXY_CAPABILITY) {
  return {
    cluster,
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    resourceGroup: 'valid-rg',
    capabilitySecret,
  };
}

describe('buildProxySpawnSpec', () => {
  it('removes user-plugin executables from the proxy PATH', () => {
    const userPlugins = path.join(tmpdir(), 'Headlamp', 'user-plugins');
    const systemBin = path.join(tmpdir(), 'system-bin');
    const bundledBin = path.join(tmpdir(), 'Headlamp', '.plugins', 'aks-desktop', 'bin');
    const userMinikubeBin = path.join(userPlugins, 'headlamp_minikube', 'bin');

    const environment = sanitizeProxyEnvironment(
      {
        HOME: path.join(tmpdir(), 'home'),
        PATH: [userMinikubeBin, bundledBin, systemBin].join(path.delimiter),
      },
      userPlugins
    );

    expect(environment.HOME).toBe(path.join(tmpdir(), 'home'));
    expect(environment.PATH).toBe([bundledBin, systemBin].join(path.delimiter));
  });

  it('runs az directly without a shell on POSIX', () => {
    const spec = buildProxySpawnSpec(proxyRequest('cluster-a'), 47011, 'linux');

    expect(spec).toEqual({
      command: 'az',
      args: [
        'connectedk8s',
        'proxy',
        '--subscription',
        '00000000-0000-0000-0000-000000000000',
        '--resource-group',
        'valid-rg',
        '--name',
        'cluster-a',
        '--port',
        '47011',
      ],
      options: { detached: true, shell: false, windowsHide: true },
    });
  });

  it('uses cmd.exe explicitly for the Azure CLI Windows entry point', () => {
    const spec = buildProxySpawnSpec(
      { ...proxyRequest('cluster-a'), resourceGroup: 'rg(prod)' },
      47011,
      'win32',
      'C:\\Windows\\cmd.exe'
    );

    expect(spec).toEqual({
      command: 'C:\\Windows\\cmd.exe',
      args: [
        '/d',
        '/s',
        '/c',
        'az.cmd connectedk8s proxy --subscription "00000000-0000-0000-0000-000000000000" --resource-group "rg(prod)" --name "cluster-a" --port "47011"',
      ],
      options: {
        detached: true,
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: true,
      },
    });
  });

  it.runIf(process.platform === 'win32')('executes a real .cmd entry point', async () => {
    const { spawn: actualSpawn } = await vi.importActual<typeof import('child_process')>(
      'child_process'
    );
    const directory = await mkdtemp(path.join(tmpdir(), 'headlamp-az-cmd-'));
    await writeFile(path.join(directory, 'az.cmd'), '@echo off\r\necho %*\r\n');
    const spec = buildProxySpawnSpec(
      {
        ...proxyRequest('cluster-a'),
        resourceGroup: 'rg(prod)',
      },
      47011
    );

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = actualSpawn(spec.command, spec.args, {
        ...spec.options,
        env: { ...process.env, PATH: `${directory}${path.delimiter}${process.env.PATH}` },
      });
      let output = '';
      child.stdout?.on('data', data => (output += data.toString()));
      child.once('error', reject);
      child.once('exit', code =>
        code === 0 ? resolve(output) : reject(new Error(`exit ${code}`))
      );
    });

    expect(stdout).toContain('connectedk8s proxy');
    expect(stdout).toContain('--name "cluster-a"');
    expect(stdout).toContain('--resource-group "rg(prod)"');
    expect(stdout).toContain('--port "47011"');
  });
});

describe('cluster proxy handler', () => {
  beforeEach(() => {
    probedPorts.length = 0;
    createServerMock.mockReset();
    createServerMock.mockImplementation(() => portProbe());
    spawnMock.mockReset();
    spawnMock.mockReturnValue(proxyChild());
  });

  afterEach(async () => {
    vi.spyOn(process, 'kill').mockReturnValue(true);
    const cleanup = killAllProxies();
    for (const child of createdProxyChildren) {
      child.emit('exit', null, 'SIGKILL');
    }
    await cleanup;
    createdProxyChildren.length = 0;
    vi.restoreAllMocks();
  });

  it('runs provider-specific SSH bastion proxy behavior', async () => {
    type SshBastionTarget = {
      cluster: string;
      bastion: string;
      kubeconfig: string;
    };
    const waitUntilReady = vi.fn(async ({ localPort }: { localPort: number }) => ({
      success: true,
      endpoint: { host: '127.0.0.1' as const, port: localPort },
    }));
    const provider: ManagedProxyProvider<SshBastionTarget> = {
      id: 'ssh-bastion-kubectl-proxy',
      validateRequest: request => {
        const data = request as SshBastionTarget;
        return { target: data };
      },
      targetKey: target => JSON.stringify([target.bastion, target.kubeconfig, target.cluster]),
      buildSpawnSpec: (target, port) => ({
        command: 'ssh',
        args: [
          '-T',
          '-o',
          'BatchMode=yes',
          '-o',
          'ExitOnForwardFailure=yes',
          '-L',
          `127.0.0.1:${port}:127.0.0.1:${port}`,
          target.bastion,
          'kubectl',
          '--kubeconfig',
          target.kubeconfig,
          '--context',
          target.cluster,
          'proxy',
          '--address=127.0.0.1',
          `--port=${port}`,
        ],
        options: { detached: true, shell: false },
      }),
      waitUntilReady,
    };
    const { handlers, ipcMain } = ipcMainMock();
    setupManagedProxyHandler(
      ipcMain,
      'start-ssh-bastion-proxy',
      PROXY_CAPABILITY,
      provider,
      async () => ({ PATH: '/test/bin' })
    );

    await expect(
      handlers.get('start-ssh-bastion-proxy')!({} as Electron.IpcMainInvokeEvent, {
        cluster: 'remote-cluster',
        bastion: 'operator@bastion.example.com',
        kubeconfig: '~/.kube/config',
        capabilitySecret: PROXY_CAPABILITY,
      })
    ).resolves.toEqual({
      success: true,
      endpoint: { host: '127.0.0.1', port: 47011 },
    });

    expect(spawnMock).toHaveBeenCalledWith(
      'ssh',
      [
        '-T',
        '-o',
        'BatchMode=yes',
        '-o',
        'ExitOnForwardFailure=yes',
        '-L',
        '127.0.0.1:47011:127.0.0.1:47011',
        'operator@bastion.example.com',
        'kubectl',
        '--kubeconfig',
        '~/.kube/config',
        '--context',
        'remote-cluster',
        'proxy',
        '--address=127.0.0.1',
        '--port=47011',
      ],
      expect.objectContaining({ detached: true, shell: false })
    );
    expect(waitUntilReady).toHaveBeenCalledWith(
      expect.objectContaining({ localPort: 47011, timeoutMs: 30_000 })
    );

    await expect(
      handlers.get('start-ssh-bastion-proxy')!({} as Electron.IpcMainInvokeEvent, {
        cluster: 'remote-cluster',
        bastion: 'operator@bastion.example.com',
        kubeconfig: '~/.kube/config',
        capabilitySecret: PROXY_CAPABILITY,
      })
    ).resolves.toEqual({
      success: true,
      endpoint: { host: '127.0.0.1', port: 47011 },
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(waitUntilReady).toHaveBeenCalledTimes(1);
  });

  it('contains provider readiness errors and terminates the process', async () => {
    await withPlatform('linux', async () => {
      const child = proxyChild(1111);
      spawnMock.mockReturnValue(child);
      const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
      let rejectReadiness!: (error: Error) => void;
      const provider: ManagedProxyProvider<{ cluster: string }> = {
        id: 'ssh-bastion-kubectl-proxy',
        validateRequest: request => ({ target: request as { cluster: string } }),
        targetKey: target => target.cluster,
        buildSpawnSpec: () => ({
          command: 'ssh',
          args: [],
          options: { detached: true, shell: false },
        }),
        waitUntilReady: () =>
          new Promise((_resolve, reject) => {
            rejectReadiness = reject;
          }),
      };
      const { handlers, ipcMain } = ipcMainMock();
      setupManagedProxyHandler(
        ipcMain,
        'start-ssh-bastion-proxy',
        PROXY_CAPABILITY,
        provider,
        async () => ({ PATH: '/test/bin' })
      );

      const result = handlers.get('start-ssh-bastion-proxy')!({} as Electron.IpcMainInvokeEvent, {
        cluster: 'remote-cluster',
        capabilitySecret: PROXY_CAPABILITY,
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
      child.stderr.emit('data', 'bastion connection refused');
      rejectReadiness(new Error('SSH readiness probe failed'));
      await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(-1111, 'SIGKILL'));
      child.emit('exit', null, 'SIGKILL');

      await expect(result).resolves.toEqual({
        success: false,
        error:
          'Cluster proxy readiness failed: SSH readiness probe failed\n' +
          'bastion connection refused',
      });
    });
  });

  it('does not reuse an unready provider child after failed cleanup', async () => {
    await withPlatform('linux', async () => {
      const child = proxyChild(1111);
      spawnMock.mockReturnValue(child);
      const killError = Object.assign(new Error('not permitted'), { code: 'EPERM' });
      const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw killError;
      });
      const provider: ManagedProxyProvider<{ cluster: string }> = {
        id: 'ssh-bastion-kubectl-proxy',
        validateRequest: request => ({ target: request as { cluster: string } }),
        targetKey: target => target.cluster,
        buildSpawnSpec: () => ({
          command: 'ssh',
          args: [],
          options: { detached: true, shell: false },
        }),
        waitUntilReady: async () => ({ success: false, error: 'SSH proxy is not ready.' }),
      };
      const { handlers, ipcMain } = ipcMainMock();
      setupManagedProxyHandler(
        ipcMain,
        'start-ssh-bastion-proxy',
        PROXY_CAPABILITY,
        provider,
        async () => ({ PATH: '/test/bin' })
      );
      const request = {
        cluster: 'remote-cluster',
        capabilitySecret: PROXY_CAPABILITY,
      };

      await expect(
        handlers.get('start-ssh-bastion-proxy')!({} as Electron.IpcMainInvokeEvent, request)
      ).resolves.toEqual({ success: false, error: 'SSH proxy is not ready.' });
      await expect(
        handlers.get('start-ssh-bastion-proxy')!({} as Electron.IpcMainInvokeEvent, request)
      ).resolves.toEqual({
        success: false,
        error: 'The previous cluster proxy could not be terminated.',
      });
      expect(kill).toHaveBeenCalledTimes(2);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      child.emit('exit', null, 'SIGKILL');
    });
  });

  it('rejects a provider validation result without a target', async () => {
    const provider: ManagedProxyProvider<{ cluster: string }> = {
      id: 'invalid-provider',
      validateRequest: () => ({}),
      targetKey: target => target.cluster,
      buildSpawnSpec: vi.fn(),
      waitUntilReady: vi.fn(),
    };
    const { handlers, ipcMain } = ipcMainMock();
    setupManagedProxyHandler(
      ipcMain,
      'start-invalid-proxy',
      PROXY_CAPABILITY,
      provider,
      async () => ({ PATH: '/test/bin' })
    );

    await expect(
      handlers.get('start-invalid-proxy')!({} as Electron.IpcMainInvokeEvent, {
        capabilitySecret: PROXY_CAPABILITY,
      })
    ).resolves.toEqual({
      success: false,
      error: 'Cluster proxy target is invalid.',
    });
    expect(provider.buildSpawnSpec).not.toHaveBeenCalled();
    expect(provider.waitUntilReady).not.toHaveBeenCalled();
  });

  it('rejects callers without the scoped capability', async () => {
    const start = startHandler();

    await expect(
      start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a', 'invalid-capability'))
    ).resolves.toEqual({
      success: false,
      error: 'Cluster proxy capability is invalid.',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each([
    { ...proxyRequest('cluster;calc'), cluster: 'cluster;calc' },
    { ...proxyRequest('cluster-a'), subscriptionId: 'sub && calc' },
    { ...proxyRequest('cluster-a'), resourceGroup: 'rg | calc' },
    { ...proxyRequest('cluster-a'), cluster: ['cluster-a'] },
    {
      ...proxyRequest('cluster-a'),
      subscriptionId: ['00000000-0000-0000-0000-000000000000'],
    },
    { ...proxyRequest('cluster-a'), resourceGroup: ['valid-rg'] },
  ])('rejects an unsafe target before spawning', async request => {
    const start = startHandler();

    await expect(start({} as Electron.IpcMainInvokeEvent, request)).resolves.toEqual({
      success: false,
      error: 'Cluster proxy target is invalid.',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('rejects an incomplete target before spawning', async () => {
    const start = startHandler();

    await expect(
      start({} as Electron.IpcMainInvokeEvent, { capabilitySecret: PROXY_CAPABILITY })
    ).resolves.toEqual({
      success: false,
      error: 'Cluster proxy target is incomplete.',
    });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('coalesces duplicate starts for the same cluster', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    const duplicate = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    let settled = false;
    void first.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    child.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");

    await expect(Promise.all([first, duplicate])).resolves.toEqual([
      { success: true },
      { success: true },
    ]);
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('replaces the proxy handler without bypassing an in-flight start', async () => {
    const { handlers, ipcMain } = ipcMainMock();
    const mainWindow = { id: 1 } as Electron.BrowserWindow;
    const environment = async () => ({ PATH: '/test/bin' });
    const firstChild = proxyChild(1111);
    const secondChild = proxyChild(2222);
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);

    expect(() =>
      setupProxyHandlers(mainWindow, ipcMain, PROXY_CAPABILITY, environment)
    ).not.toThrow();
    const first = handlers.get('start-cluster-proxy')!(
      {} as Electron.IpcMainInvokeEvent,
      proxyRequest('cluster-a', PROXY_CAPABILITY)
    );
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    const replacementCapability = 'fedcba9876543210fedcba9876543210';
    expect(() =>
      setupProxyHandlers(mainWindow, ipcMain, replacementCapability, environment)
    ).not.toThrow();
    const second = handlers.get('start-cluster-proxy')!(
      {} as Electron.IpcMainInvokeEvent,
      proxyRequest('cluster-b', replacementCapability)
    );
    await Promise.resolve();
    expect(spawnMock).toHaveBeenCalledTimes(1);

    firstChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
    await expect(first).resolves.toEqual({ success: true });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    secondChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-b' context\n");
    await expect(second).resolves.toEqual({ success: true });

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(2);
    expect(handlers.has('start-cluster-proxy')).toBe(true);
  });

  it('drains proxy output for the child lifetime', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    expect(child.stderr.listenerCount('data')).toBeGreaterThan(0);
    child.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
    await expect(result).resolves.toEqual({ success: true });
    expect(child.stdout.listenerCount('data')).toBeGreaterThan(0);
  });

  it('recognizes readiness before truncating a long stdout chunk', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.stdout.emit(
      'data',
      `Start sending kubectl requests on 'cluster-a' context\n${'x'.repeat(300)}`
    );

    await expect(result).resolves.toEqual({ success: true });
  });

  it('serializes different clusters until the first proxy reports ready', async () => {
    const firstChild = proxyChild(1111);
    const secondChild = proxyChild(2222);
    spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const start = startHandler();

    const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    const second = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-b'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

    firstChild.stdout.emit('data', 'Start sending kub');
    firstChild.stdout.emit('data', "ectl requests on 'cluster-a' context\n");
    await expect(first).resolves.toEqual({ success: true });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    secondChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-b' context\n");
    await second;

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0][1].join(' ')).toContain('47011');
    expect(spawnMock.mock.calls[1][1].join(' ')).toContain('47013');
  });

  it('skips a proxy port pair occupied outside this module', async () => {
    createServerMock
      .mockImplementationOnce(() => portProbe(false))
      .mockImplementation(() => portProbe());
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    expect(probedPorts).toEqual([47010, 47012, 47013]);
    expect(spawnMock.mock.calls[0][1].join(' ')).toContain('47013');
    child.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
    await expect(result).resolves.toEqual({ success: true });
  });

  it('retires the previous same-name target before starting its replacement', async () => {
    await withPlatform('linux', async () => {
      const firstChild = proxyChild(1111);
      const secondChild = proxyChild(2222);
      spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
      const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
      const start = startHandler();

      const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
      firstChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
      await expect(first).resolves.toEqual({ success: true });

      const reconfigured = start({} as Electron.IpcMainInvokeEvent, {
        ...proxyRequest('cluster-a'),
        resourceGroup: 'different-rg',
      });
      await vi.waitFor(() => expect(kill).toHaveBeenCalledWith(-1111, 'SIGKILL'));
      expect(spawnMock).toHaveBeenCalledTimes(1);

      firstChild.emit('exit', null, 'SIGKILL');
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
      secondChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
      await expect(reconfigured).resolves.toEqual({ success: true });

      const invocation = spawnMock.mock.calls[1][1].join(' ');
      expect(invocation).toContain('different-rg');
      expect(invocation).toContain('--port');
      expect(invocation).toContain('47011');
    });
  });

  it('returns a spawn failure and releases the queue', async () => {
    const failedChild = proxyChild();
    Object.defineProperty(failedChild, 'pid', { value: undefined, configurable: true });
    const secondChild = proxyChild(2222);
    spawnMock.mockReturnValueOnce(failedChild).mockReturnValueOnce(secondChild);
    const start = startHandler();

    const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    const second = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-b'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    failedChild.emit('error', new Error('spawn az ENOENT'));

    await expect(first).resolves.toEqual({ success: false, error: 'spawn az ENOENT' });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    secondChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-b' context\n");
    await expect(second).resolves.toEqual({ success: true });
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('returns a failure when the proxy exits before reporting ready', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('exit', 1, null);

    await expect(result).resolves.toEqual({
      success: false,
      error: 'Cluster proxy exited before reporting readiness (code 1).',
    });
  });

  it('includes a bounded stderr tail when startup exits', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.stderr.emit('data', `${'x'.repeat(3000)}Azure CLI login required`);
    child.emit('exit', 1, null);

    const failure = await result;
    expect(failure.success).toBe(false);
    expect(failure.error).toContain('Cluster proxy exited before reporting readiness (code 1).');
    expect(failure.error).toContain('Azure CLI login required');
    expect(failure.error!.length).toBeLessThan(2300);
  });

  it('returns a failure when a spawned proxy errors before reporting ready', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.emit('error', new Error('proxy bootstrap failed'));

    await expect(result).resolves.toEqual({
      success: false,
      error: 'Cluster proxy failed before readiness: proxy bootstrap failed',
    });
  });

  it('reuses a live proxy after it has reported ready', async () => {
    const child = proxyChild();
    spawnMock.mockReturnValue(child);
    const start = startHandler();

    const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
    child.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
    await expect(first).resolves.toEqual({ success: true });

    await expect(
      start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'))
    ).resolves.toEqual({ success: true });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('returns a failure when proxy readiness times out', async () => {
    await withPlatform('linux', async () => {
      vi.useFakeTimers();
      const child = proxyChild();
      spawnMock.mockReturnValue(child);
      vi.spyOn(process, 'kill').mockReturnValue(true);
      const start = startHandler();

      const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      await vi.advanceTimersByTimeAsync(30_000);
      child.emit('exit', null, 'SIGKILL');

      await expect(result).resolves.toEqual({
        success: false,
        error: 'Cluster proxy did not report readiness within 30000ms.',
      });
      vi.useRealTimers();
    });
  });

  it('keeps the failed port reserved until timeout termination completes', async () => {
    await withPlatform('linux', async () => {
      vi.useFakeTimers();
      const firstChild = proxyChild(1111);
      const secondChild = proxyChild(2222);
      spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
      vi.spyOn(process, 'kill').mockReturnValue(true);
      const start = startHandler();

      const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      const second = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-b'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
      firstChild.stderr.emit('data', 'Azure CLI authentication timed out');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      let firstSettled = false;
      void first.then(() => (firstSettled = true));
      await Promise.resolve();
      expect(firstSettled).toBe(false);

      firstChild.emit('exit', null, 'SIGKILL');
      await expect(first).resolves.toEqual({
        success: false,
        error:
          'Cluster proxy did not report readiness within 30000ms.\nAzure CLI authentication timed out',
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
      expect(spawnMock.mock.calls[1][1].join(' ')).toContain('47011');
      secondChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-b' context\n");
      await expect(second).resolves.toEqual({ success: true });
      vi.useRealTimers();
    });
  });

  it('waits for Windows taskkill before releasing a timed-out port', async () => {
    await withPlatform('win32', async () => {
      vi.useFakeTimers();
      const firstChild = proxyChild(1111);
      const taskkillChild = proxyChild(3333);
      const secondChild = proxyChild(2222);
      spawnMock
        .mockReturnValueOnce(firstChild)
        .mockReturnValueOnce(taskkillChild)
        .mockReturnValueOnce(secondChild);
      const start = startHandler();

      const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      const second = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-b'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(spawnMock.mock.calls[1].slice(0, 2)).toEqual([
        'taskkill',
        ['/pid', '1111', '/T', '/F'],
      ]);

      let firstSettled = false;
      void first.then(() => (firstSettled = true));
      firstChild.emit('exit', null, 'SIGKILL');
      await vi.advanceTimersByTimeAsync(0);
      expect(firstSettled).toBe(false);
      expect(spawnMock).toHaveBeenCalledTimes(2);

      taskkillChild.emit('exit', 0, null);
      await expect(first).resolves.toEqual({
        success: false,
        error: 'Cluster proxy did not report readiness within 30000ms.',
      });
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(3));
      expect(spawnMock.mock.calls[2][1].join(' ')).toContain('47011');
      secondChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-b' context\n");
      await expect(second).resolves.toEqual({ success: true });
      vi.useRealTimers();
    });
  });

  it('does not spawn a queued proxy after shutdown begins', async () => {
    await withPlatform('linux', async () => {
      const firstChild = proxyChild(1111);
      spawnMock.mockReturnValue(firstChild);
      vi.spyOn(process, 'kill').mockReturnValue(true);
      const start = startHandler();

      const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      const second = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-b'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

      const cleanup = killAllProxies();
      firstChild.emit('exit', null, 'SIGKILL');
      await cleanup;

      await expect(first).resolves.toEqual({
        success: false,
        error: 'Cluster proxy exited before reporting readiness (signal SIGKILL).',
      });
      await expect(second).resolves.toEqual({
        success: false,
        error: 'The app is shutting down.',
      });
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });
  });

  it('fails replacement safely when the previous proxy cannot be signaled', async () => {
    await withPlatform('linux', async () => {
      const firstChild = proxyChild(1111);
      const secondChild = proxyChild(2222);
      spawnMock.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
      const killError = Object.assign(new Error('not permitted'), { code: 'EPERM' });
      vi.spyOn(process, 'kill').mockImplementation(() => {
        throw killError;
      });
      const start = startHandler();
      const first = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
      firstChild.stdout.emit('data', "Start sending kubectl requests on 'cluster-a' context\n");
      await expect(first).resolves.toEqual({ success: true });

      await expect(
        start({} as Electron.IpcMainInvokeEvent, {
          ...proxyRequest('cluster-a'),
          resourceGroup: 'replacement-rg',
        })
      ).resolves.toEqual({
        success: false,
        error: 'The previous cluster proxy could not be terminated.',
      });
      expect(spawnMock).toHaveBeenCalledTimes(1);

      firstChild.emit('exit', null, 'SIGKILL');
    });
  });

  it('bounds shutdown cleanup when a signaled child never exits', async () => {
    await withPlatform('linux', async () => {
      vi.useFakeTimers();
      try {
        const child = proxyChild();
        spawnMock.mockReturnValue(child);
        vi.spyOn(process, 'kill').mockReturnValue(true);
        const start = startHandler();
        const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
        await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

        const cleanup = killAllProxies();
        let cleanupSettled = false;
        void cleanup.then(() => (cleanupSettled = true));
        await vi.advanceTimersByTimeAsync(4_999);
        expect(cleanupSettled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(cleanup).resolves.toBeUndefined();

        child.emit('exit', null, 'SIGKILL');
        await expect(result).resolves.toEqual({
          success: false,
          error: 'Cluster proxy exited before reporting readiness (signal SIGKILL).',
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('kills the POSIX process group on shutdown', async () => {
    await withPlatform('linux', async () => {
      const child = proxyChild();
      spawnMock.mockReturnValue(child);
      const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
      const start = startHandler();
      const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));

      const cleanup = killAllProxies();

      expect(kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
      let cleanupSettled = false;
      void cleanup.then(() => (cleanupSettled = true));
      await Promise.resolve();
      expect(cleanupSettled).toBe(false);
      child.emit('exit', null, 'SIGKILL');
      await expect(cleanup).resolves.toBeUndefined();
      await expect(result).resolves.toEqual({
        success: false,
        error: 'Cluster proxy exited before reporting readiness (signal SIGKILL).',
      });
    });
  });

  it('kills the Windows child tree on shutdown', async () => {
    await withPlatform('win32', async () => {
      const child = proxyChild();
      spawnMock.mockReturnValue(child);
      const start = startHandler();
      const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
      spawnMock.mockClear();
      const taskkill = new EventEmitter();
      spawnMock.mockReturnValue(taskkill);

      const cleanup = killAllProxies();

      expect(spawnMock).toHaveBeenCalledWith('taskkill', ['/pid', '4242', '/T', '/F']);
      child.emit('exit', null, 'SIGKILL');
      let cleanupSettled = false;
      void cleanup.then(() => (cleanupSettled = true));
      await Promise.resolve();
      expect(cleanupSettled).toBe(false);
      taskkill.emit('exit', 0, null);
      await expect(cleanup).resolves.toBeUndefined();
      await expect(result).resolves.toEqual({
        success: false,
        error: 'Cluster proxy exited before reporting readiness (signal SIGKILL).',
      });
    });
  });

  it('bounds shutdown when Windows taskkill never settles', async () => {
    await withPlatform('win32', async () => {
      vi.useFakeTimers();
      try {
        const child = proxyChild();
        spawnMock.mockReturnValue(child);
        const start = startHandler();
        const result = start({} as Electron.IpcMainInvokeEvent, proxyRequest('cluster-a'));
        await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1));
        const taskkill = new EventEmitter();
        spawnMock.mockReturnValue(taskkill);

        const cleanup = killAllProxies();
        let cleanupSettled = false;
        void cleanup.then(() => (cleanupSettled = true));
        await vi.advanceTimersByTimeAsync(4_999);
        expect(cleanupSettled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await expect(cleanup).resolves.toBeUndefined();

        child.emit('exit', null, 'SIGKILL');
        await expect(result).resolves.toEqual({
          success: false,
          error: 'Cluster proxy exited before reporting readiness (signal SIGKILL).',
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
