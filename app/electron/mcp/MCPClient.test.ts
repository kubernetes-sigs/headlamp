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

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import MCPClient from './MCPClient';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp'),
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

function tmpPath(): string {
  return path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random()}.json`);
}

describe('MCPClient', () => {
  let client: MCPClient;
  let infoSpy: Mock;
  let logSpy: Mock;

  let cfgPath: string;
  let settingsPath: string;

  beforeEach(() => {
    vi.stubEnv('HEADLAMP_MCP_DEBUG', undefined);
    cfgPath = tmpPath();
    settingsPath = tmpPath();
    try {
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    try {
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    } catch {
      // ignore
    }
  });

  beforeEach(() => {
    client = new MCPClient(cfgPath, settingsPath);
    // spy on console.info to avoid noisy output and to assert calls
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {}) as unknown as Mock;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as unknown as Mock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws from handleClustersChange if not initialized', async () => {
    await expect(client.handleClustersChange(['cluster-a'])).rejects.toThrow(
      'MCPClient: not initialized'
    );
  });

  it('accepts MCP IPC only from the trusted document in the active main frame', () => {
    const trustedStartUrl = 'http://127.0.0.1:3000/';
    const client = new MCPClient(cfgPath, settingsPath, undefined, trustedStartUrl);
    const mainFrame = { url: `${trustedStartUrl}#settings` };
    const webContents = { mainFrame };
    client.setMainWindow({ webContents } as any);

    expect(() =>
      (client as any).assertTrustedIpcEvent({ sender: webContents, senderFrame: mainFrame })
    ).not.toThrow();
    expect(() =>
      (client as any).assertTrustedIpcEvent({ sender: webContents, senderFrame: {} })
    ).toThrow('MCP IPC request rejected');
    expect(() =>
      (client as any).assertTrustedIpcEvent({ sender: {}, senderFrame: mainFrame })
    ).toThrow('MCP IPC request rejected');
    expect(() =>
      (client as any).assertTrustedIpcEvent({
        sender: webContents,
        senderFrame: { ...mainFrame, url: 'http://127.0.0.1:3000.attacker.example/' },
      })
    ).toThrow('MCP IPC request rejected');
  });

  it('initialize is idempotent and does not emit debug logs by default', async () => {
    await client.initialize();
    await client.initialize(); // second call should be a no-op

    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('config is set after initialize', async () => {
    expect((client as any).mcpToolState).toBeNull();
    await client.initialize();
    expect((client as any).mcpToolState).not.toBeNull();
  });

  it('handles malformed tool config update payloads through IPC error handling', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const result = await (client as any).mcpUpdateToolsConfig(null);

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Cannot convert undefined or null to object/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('handleClustersChange resolves when initialized without default debug logs', async () => {
    await client.initialize();
    await expect(client.handleClustersChange(['cluster-1'])).resolves.toBeUndefined();

    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('setMainWindow accepts a BrowserWindow-like object and cleanup resets state', async () => {
    // use a minimal fake to represent BrowserWindow
    const fakeWin = { id: 42 } as unknown as Electron.BrowserWindow;

    await client.initialize();
    client.setMainWindow(fakeWin);

    // handleClustersChange should work when initialized
    await expect(client.handleClustersChange(['c-x'])).resolves.toBeUndefined();

    // cleanup should reset initialized without debug logging by default
    await client.cleanup();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();

    // after cleanup, handleClustersChange should again reject as not initialized
    await expect(client.handleClustersChange(['after-cleanup'])).rejects.toThrow(
      'MCPClient: not initialized'
    );
  });

  it('cleanup is safe to call when not initialized', async () => {
    // no initialize called
    await expect(client.cleanup()).resolves.toBeUndefined();
    // no cleanup log should be emitted since it early-returns when not initialized
    expect(infoSpy).not.toHaveBeenCalledWith('MCPClient: cleaned up');
  });

  it('waits for first-use initialization and closes its client during cleanup', async () => {
    let resolveTools!: (tools: Array<{ name: string }>) => void;
    const tools = new Promise<Array<{ name: string }>>(resolve => {
      resolveTools = resolve;
    });
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return {
        getTools: vi.fn(() => tools),
        close,
      };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: { url: 'http://x' } }),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();

    const initialization = client.initializeClient();
    await vi.waitFor(() => expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(1));
    let cleanupFinished = false;
    const cleanup = client.cleanup().then(() => {
      cleanupFinished = true;
    });
    await Promise.resolve();

    expect(cleanupFinished).toBe(false);
    resolveTools([{ name: 'tool' }]);
    await Promise.all([initialization, cleanup]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(client.client).toBeNull();
    expect(client.clientTools).toEqual([]);
    expect(client.isInitialized).toBe(false);
  });

  it('initialize leaves the MCP server client dormant', async () => {
    // Mock MCPSettings to return no servers
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));
    // Mock MultiServerMCPClient just in case, it should not be constructed
    const MultiServerMCPClientMock = vi.fn();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await client.initialize();

    expect((client as any).isInitialized).toBe(false);
    expect((client as any).client).toBeNull();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('does not load the MCP adapter when configured servers are unused', async () => {
    const ensureCertificates = vi.fn();
    const adapterFactory = vi.fn(() => ({
      MultiServerMCPClient: vi.fn(),
    }));

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', adapterFactory);
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: { url: 'http://x' } }),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath, ensureCertificates);

    await client.initialize();

    expect(adapterFactory).not.toHaveBeenCalled();
    expect(ensureCertificates).not.toHaveBeenCalled();
  });

  it('constructs the MCP client when a tool is first used', async () => {
    const ensureCertificates = vi.fn();
    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const fakeTools = [{ name: 'serverA.t1', schema: {}, invoke }];
    const getTools = vi.fn().mockResolvedValue(fakeTools);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return { getTools, close };
    });
    const makeMcpServersFromSettings = vi.fn().mockReturnValue({ serverA: { url: 'http://x' } });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath, ensureCertificates);

    await client.initialize();
    expect(MultiServerMCPClientMock).not.toHaveBeenCalled();
    await client.handleClustersChange(['cluster-a']);

    const result = await (client as any).mcpExecuteTool('serverA.t1', {}, 'call-1');

    expect(makeMcpServersFromSettings).toHaveBeenCalledWith(settingsPath, ['cluster-a']);
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(1);
    expect(ensureCertificates).toHaveBeenCalledTimes(1);
    expect((client as any).clientTools).toEqual(fakeTools);
    expect(result).toEqual({ success: true, result: { ok: true }, toolCallId: 'call-1' });
  });

  it('discovers configured tools when their inventory is first requested', async () => {
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return {
        getTools: vi.fn().mockResolvedValue([
          {
            name: 'serverA__tool1',
            schema: { type: 'object' },
            description: 'First tool',
          },
        ]),
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: { url: 'http://x' } }),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);
    await client.initialize();

    expect(MultiServerMCPClientMock).not.toHaveBeenCalled();
    const result = await (client as any).mcpGetToolsConfig();

    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      config: {
        serverA: {
          tool1: {
            enabled: true,
            usageCount: 0,
            inputSchema: { type: 'object' },
            description: 'First tool',
          },
        },
      },
    });
  });

  it('restarts first-use initialization with the latest cluster context', async () => {
    const makeMcpServersFromSettings = vi
      .fn()
      .mockImplementation((_settingsPath: string, clusters: string[]) => ({
        serverA: { clusters },
      }));
    const closeFirst = vi.fn().mockResolvedValue(undefined);
    const instances = [
      { getTools: vi.fn().mockResolvedValue([{ name: 'old' }]), close: closeFirst },
      { getTools: vi.fn().mockResolvedValue([{ name: 'new' }]), close: vi.fn() },
    ];
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return instances.shift();
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers: vi.fn().mockReturnValue(true),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();

    const initialization = client.initializeClient();
    const clusterChange = client.handleClustersChange(['new-cluster']);
    await Promise.all([initialization, clusterChange]);

    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(1, settingsPath, []);
    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(2, settingsPath, ['new-cluster']);
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2);
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(client.clientTools).toEqual([{ name: 'new' }]);
  });

  it('serializes concurrent cluster-change restarts', async () => {
    let resolveInitialTools!: (tools: Array<{ name: string }>) => void;
    let resolveFirstRestartTools!: (tools: Array<{ name: string }>) => void;
    const initialTools = new Promise<Array<{ name: string }>>(resolve => {
      resolveInitialTools = resolve;
    });
    const firstRestartTools = new Promise<Array<{ name: string }>>(resolve => {
      resolveFirstRestartTools = resolve;
    });
    const makeMcpServersFromSettings = vi
      .fn()
      .mockImplementation((_settingsPath: string, clusters: string[]) => ({
        serverA: { clusters },
      }));
    const closeInitial = vi.fn().mockResolvedValue(undefined);
    const closeFirstRestart = vi.fn().mockResolvedValue(undefined);
    const instances = [
      { getTools: vi.fn(() => initialTools), close: closeInitial },
      { getTools: vi.fn(() => firstRestartTools), close: closeFirstRestart },
      { getTools: vi.fn().mockResolvedValue([{ name: 'final' }]), close: vi.fn() },
    ];
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return instances.shift();
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers: vi.fn().mockReturnValue(true),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();

    const initialization = client.initializeClient();
    await vi.waitFor(() => expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(1));
    const firstChange = client.handleClustersChange(['first-cluster']);
    const secondChange = client.handleClustersChange(['second-cluster']);

    resolveInitialTools([{ name: 'initial' }]);
    await vi.waitFor(() => expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2));
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2);

    resolveFirstRestartTools([{ name: 'first' }]);
    await Promise.all([initialization, firstChange, secondChange]);

    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(1, settingsPath, []);
    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(2, settingsPath, ['first-cluster']);
    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(3, settingsPath, ['second-cluster']);
    expect(closeInitial).toHaveBeenCalledTimes(1);
    expect(closeFirstRestart).toHaveBeenCalledTimes(1);
    expect(client.clientTools).toEqual([{ name: 'final' }]);
  });

  it('serializes cleanup behind an active cluster restart', async () => {
    let resolveOldClose!: () => void;
    let resolveReplacementTools!: (tools: Array<{ name: string }>) => void;
    const oldClose = new Promise<void>(resolve => {
      resolveOldClose = resolve;
    });
    const replacementTools = new Promise<Array<{ name: string }>>(resolve => {
      resolveReplacementTools = resolve;
    });
    const closeOld = vi.fn(() => oldClose);
    const closeReplacement = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return {
        getTools: vi.fn(() => replacementTools),
        close: closeReplacement,
      };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: {} }),
      hasClusterDependentServers: vi.fn().mockReturnValue(true),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();
    client.client = { close: closeOld };
    client.isInitialized = true;

    const clusterChange = client.handleClustersChange(['new-cluster']);
    await vi.waitFor(() => expect(closeOld).toHaveBeenCalledTimes(1));
    let cleanupFinished = false;
    const cleanup = client.cleanup().then(() => {
      cleanupFinished = true;
    });

    resolveOldClose();
    await vi.waitFor(() => expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(cleanupFinished).toBe(false);

    resolveReplacementTools([{ name: 'replacement' }]);
    await Promise.all([clusterChange, cleanup]);

    expect(closeOld).toHaveBeenCalledTimes(1);
    expect(closeReplacement).toHaveBeenCalledTimes(1);
    expect(client.client).toBeNull();
    expect(client.clientTools).toEqual([]);
    expect(client.isInitialized).toBe(false);
  });

  it('keeps a newly configured MCP server dormant', async () => {
    const ensureCertificates = vi.fn();
    const adapterFactory = vi.fn(() => ({
      MultiServerMCPClient: vi.fn(),
    }));
    const saveMCPSettings = vi.fn();

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', adapterFactory);
    vi.doMock('./MCPSettings', () => ({
      loadMCPSettings: vi.fn().mockReturnValue({ enabled: false, servers: [] }),
      saveMCPSettings,
      showSettingsChangeDialog: vi.fn().mockResolvedValue(true),
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: { url: 'http://x' } }),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath, ensureCertificates);
    const settings = { enabled: true, servers: [] };

    await client.initialize();
    client.setMainWindow({} as Electron.BrowserWindow);
    const result = await (client as any).mcpUpdateConfig(settings);

    expect(result).toEqual({ success: true });
    expect(saveMCPSettings).toHaveBeenCalledWith(settingsPath, settings);
    expect(adapterFactory).not.toHaveBeenCalled();
    expect(ensureCertificates).not.toHaveBeenCalled();
    expect((client as any).client).toBeNull();
    expect((client as any).isInitialized).toBe(false);
  });

  it('reconnects an active MCP client after configuration changes', async () => {
    const saveMCPSettings = vi.fn();

    vi.resetModules();
    vi.doMock('./MCPSettings', () => ({
      loadMCPSettings: vi.fn().mockReturnValue({ enabled: true, servers: [] }),
      saveMCPSettings,
      showSettingsChangeDialog: vi.fn().mockResolvedValue(true),
      makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    const close = vi.fn().mockResolvedValue(undefined);
    const initializeClient = vi.spyOn(client, 'initializeClient').mockResolvedValue(undefined);
    client.client = { close };
    client.setMainWindow({} as Electron.BrowserWindow);

    const settings = { enabled: true, servers: [{ name: 'server-a' }] };
    const result = await client.mcpUpdateConfig(settings);

    expect(result).toEqual({ success: true });
    expect(saveMCPSettings).toHaveBeenCalledWith(settingsPath, settings);
    expect(close).toHaveBeenCalledTimes(1);
    expect(initializeClient).toHaveBeenCalledTimes(1);
  });

  it('waits for first-use initialization before applying new settings', async () => {
    let resolveFirstTools!: (tools: Array<{ name: string }>) => void;
    const firstTools = new Promise<Array<{ name: string }>>(resolve => {
      resolveFirstTools = resolve;
    });
    const closeFirst = vi.fn().mockResolvedValue(undefined);
    const instances = [
      { getTools: vi.fn(() => firstTools), close: closeFirst },
      { getTools: vi.fn().mockResolvedValue([{ name: 'new' }]), close: vi.fn() },
    ];
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return instances.shift();
    });
    const saveMCPSettings = vi.fn();

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      loadMCPSettings: vi.fn().mockReturnValue({ enabled: true, servers: [] }),
      saveMCPSettings,
      showSettingsChangeDialog: vi.fn().mockResolvedValue(true),
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: { url: 'http://x' } }),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();
    client.setMainWindow({} as Electron.BrowserWindow);

    const initialization = client.initializeClient();
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    const update = client.mcpUpdateConfig({ enabled: true, servers: [{ name: 'new' }] });
    await Promise.resolve();

    expect(saveMCPSettings).not.toHaveBeenCalled();
    resolveFirstTools([{ name: 'old' }]);
    await Promise.all([initialization, update]);

    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2);
    expect(client.clientTools).toEqual([{ name: 'new' }]);
  });

  it.each([null, ['old-cluster'], ['z-current', 'a-selected']])(
    'restores cluster context when an MCP restart fails from %j',
    async oldClusters => {
      vi.resetModules();
      vi.doMock('./MCPSettings', () => ({
        makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
        hasClusterDependentServers: vi.fn().mockReturnValue(true),
      }));

      const { default: MCPClient } = await import('./MCPClient');
      const client = new MCPClient(cfgPath, settingsPath) as any;
      await client.initialize();
      await client.handleClustersChange(oldClusters);
      const oldMembership = client.currentClusters;
      client.client = { close: vi.fn().mockResolvedValue(undefined) };
      vi.spyOn(client, 'initializeClient').mockRejectedValue(new Error('restart failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(client.handleClustersChange(['new-cluster'])).rejects.toThrow('restart failed');
      expect(client.currentClusters).toEqual(oldMembership);
      expect(client.clusters).toEqual(oldClusters || []);
    }
  );

  it('clears cluster context through the IPC-facing path without starting MCP', async () => {
    await client.initialize();
    (client as any).currentClusters = ['old-cluster'];
    (client as any).clusters = ['old-cluster'];

    const result = await (client as any).mcpClusterChange(null);

    expect(result).toEqual({ success: true });
    expect((client as any).currentClusters).toBeNull();
    expect((client as any).clusters).toEqual([]);
    expect((client as any).client).toBeNull();
  });

  it.each([false, true])(
    'logs a single tool count only when debug is enabled (%s)',
    async debug => {
      if (debug) {
        process.env.HEADLAMP_MCP_DEBUG = 'true';
      }
      const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
        return { getTools: vi.fn().mockResolvedValue([{ name: 'private-server__private-tool' }]) };
      });

      vi.resetModules();
      vi.doMock('@langchain/mcp-adapters', () => ({
        MultiServerMCPClient: MultiServerMCPClientMock,
      }));
      vi.doMock('./MCPSettings', () => ({
        makeMcpServersFromSettings: vi.fn().mockReturnValue({ privateServer: {} }),
        hasClusterDependentServers: vi.fn().mockReturnValue(false),
      }));

      const { default: MCPClient } = await import('./MCPClient');
      const client = new MCPClient(cfgPath, settingsPath);
      await client.initialize();
      await client['initializeClient']();

      if (debug) {
        const initializationLogs = logSpy.mock.calls.filter(
          ([message]) =>
            message === 'MCPClient: doInitialize: MCP client initialized successfully with tools:'
        );
        expect(initializationLogs).toEqual([
          [
            'MCPClient: doInitialize: MCP client initialized successfully with tools:',
            { count: 1 },
          ],
        ]);
      } else {
        expect(logSpy).not.toHaveBeenCalled();
        expect(infoSpy).not.toHaveBeenCalled();
      }
    }
  );

  it('handleClustersChange logs and returns early when no cluster-dependent servers', async () => {
    const getTools = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return { getTools, close };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    // make servers exist, but indicate no cluster-dependent servers
    const makeMcpServersFromSettings = vi.fn().mockReturnValue({ serverA: {} });
    const hasClusterDependentServers = vi.fn().mockReturnValue(false);
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers,
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);

    await client.initialize();
    await (client as any).initializeClient();

    const beforeClient = (client as any).client;

    await client.handleClustersChange(['cluster-x']);

    // since hasClusterDependentServers returned false, client unchanged
    expect((client as any).client).toBe(beforeClient);
  });

  it('handleClustersChange does nothing when clusters array is identical', async () => {
    const getTools = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return { getTools, close };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: {} }),
      hasClusterDependentServers: vi.fn().mockReturnValue(true),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);

    await client.initialize();
    await client.handleClustersChange(['same-cluster']);
    await client['initializeClient']();

    vi.spyOn(console, 'info').mockImplementation(() => {});
    const closeSpy = vi.spyOn((client as any).client, 'close').mockImplementation(async () => {});

    await client.handleClustersChange(['same-cluster']);

    // close should not have been called because clusters didn't change
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it.each([
    [['z-current', 'a-selected']],
    [
      ['z-current', 'a-selected', 'b-selected'],
      ['z-current', 'b-selected', 'a-selected'],
    ],
  ])('preserves caller order for lazy MCP configuration after %j', async (...updates) => {
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return {
        getTools: vi.fn().mockResolvedValue([]),
        close: vi.fn().mockResolvedValue(undefined),
      };
    });

    vi.resetModules();
    vi.doUnmock('./MCPSettings');
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        mcp: {
          enabled: true,
          servers: [
            {
              name: 'context',
              command: 'echo',
              args: ['HEADLAMP_CURRENT_CLUSTER'],
              enabled: true,
            },
          ],
        },
      })
    );

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);
    await client.initialize();
    for (const clusters of updates) {
      await client.handleClustersChange(clusters);
    }
    expect(MultiServerMCPClientMock).not.toHaveBeenCalled();
    await client['initializeClient']();

    expect(MultiServerMCPClientMock).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        mcpServers: {
          context: expect.objectContaining({ args: ['z-current'] }),
        },
      })
    );
    expect(client['clusters']).toEqual(updates.at(-1));
  });

  it('does not restart MCP for secondary-cluster reordering', async () => {
    const getTools = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return { getTools, close };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({ serverA: {} }),
      hasClusterDependentServers: vi.fn().mockReturnValue(true),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);

    await client.initialize();
    await client.handleClustersChange(['cluster-a', 'cluster-b', 'cluster-c']);
    await client['initializeClient']();

    await client.handleClustersChange(['cluster-a', 'cluster-c', 'cluster-b']);

    expect(close).not.toHaveBeenCalled();
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(1);
    expect(client['currentClusters']).toEqual(['cluster-a', 'cluster-b', 'cluster-c']);
    expect(client['clusters']).toEqual(['cluster-a', 'cluster-c', 'cluster-b']);
  });

  it('restarts MCP when the current cluster changes within the same membership', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return { getTools: vi.fn().mockResolvedValue([]), close };
    });

    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    const makeMcpServersFromSettings = vi.fn().mockReturnValue({ serverA: {} });
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers: vi.fn().mockReturnValue(true),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);
    await client.initialize();
    await client.handleClustersChange(['cluster-a', 'cluster-b']);
    await client['initializeClient']();

    await client.handleClustersChange(['cluster-b', 'cluster-a']);

    expect(close).toHaveBeenCalledTimes(1);
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2);
    expect(makeMcpServersFromSettings).toHaveBeenLastCalledWith(settingsPath, [
      'cluster-b',
      'cluster-a',
    ]);
  });

  it('handleClustersChange restarts client when cluster-dependent servers exist', async () => {
    const getToolsFirst = vi.fn().mockResolvedValue([{ name: 'a' }]);
    const closeFirst = vi.fn().mockResolvedValue(undefined);
    const getToolsSecond = vi.fn().mockResolvedValue([{ name: 'b' }]);
    const closeSecond = vi.fn().mockResolvedValue(undefined);

    // We'll create a factory to return different instances on subsequent constructions
    const instances: any[] = [
      { getTools: getToolsFirst, close: closeFirst },
      { getTools: getToolsSecond, close: closeSecond },
    ];
    const MultiServerMCPClientMock = vi.fn().mockImplementation(function () {
      return instances.shift();
    });

    // Ensure module cache is cleared so our doMock is respected when importing the MCPClient module
    vi.resetModules();
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    const makeMcpServersFromSettings = vi.fn().mockReturnValue({ serverA: {} });
    const hasClusterDependentServers = vi.fn().mockReturnValue(true);
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers,
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    await client.initialize();
    await (client as any).initializeClient();

    // initial client should be the first instance
    const firstClientRef = (client as any).client;
    expect(firstClientRef).not.toBeNull();

    // Trigger cluster change: should create a new client for the new cluster
    await client.handleClustersChange(['new-cluster']);

    // The MCP client constructor should have been called for initial setup and again for restart
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2);
    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(1, settingsPath, []);
    expect(makeMcpServersFromSettings).toHaveBeenNthCalledWith(2, settingsPath, ['new-cluster']);

    // After restart, client should have been replaced
    const afterClientRef = (client as any).client;
    expect(afterClientRef).not.toBeNull();
    // And tools should reflect second initialization
    expect((client as any).clientTools).toEqual([{ name: 'b' }]);
    expect((client as any).clusters).toEqual(['new-cluster']);
  });
});

describe('MCPClient logging behavior', () => {
  beforeEach(() => {
    vi.stubEnv('HEADLAMP_MCP_DEBUG', undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([false, true])('logs clusters safely (debug=%s)', async debug => {
    if (debug) {
      process.env.HEADLAMP_MCP_DEBUG = 'true';
    }
    const cfgPath = tmpPath();
    const { default: MCPClientLocal } = await import('./MCPClient');
    const client = new MCPClientLocal(cfgPath, cfgPath);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(client.handleClustersChange(['cluster-log'])).rejects.toThrow(
      'MCPClient: not initialized'
    );

    if (debug) {
      expect(infoSpy).toHaveBeenCalledWith('MCPClient: clusters changed ->', ['[REDACTED]']);
    } else {
      expect(infoSpy).not.toHaveBeenCalled();
    }
  });
});

describe('MCPClient#mcpExecuteTool', () => {
  const cfgPath = tmpPath();
  const settingsPath = tmpPath();

  beforeEach(() => {
    expect(vi.isMockFunction(console.log)).toBe(false);
    vi.stubEnv('HEADLAMP_MCP_DEBUG', undefined);
    try {
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    } catch {}
    try {
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    } catch {}
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([false, true])('executes tools safely (debug=%s)', async debug => {
    if (debug) {
      process.env.HEADLAMP_MCP_DEBUG = 'true';
    }
    vi.resetModules();
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));
    vi.doMock('./MCPToolStateStore', () => ({
      parseServerNameToolName: vi.fn().mockImplementation((fullName: string) => {
        const [serverName, ...rest] = fullName.split('.');
        return { serverName, toolName: rest.join('.') };
      }),
      validateToolArgs: vi.fn().mockReturnValue({ valid: true }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {
          initialize: vi.fn(),
          // initialize config from client tools is invoked during MCPClient.initialize
          // provide a no-op mock so tests that don't assert this behavior don't fail
          initConfigFromClientTools: vi.fn(),
        };
      }),
    }));

    // Ensure initialize can construct a client with getTools/close methods
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: vi.fn().mockImplementation(function () {
        return {
          getTools: vi.fn().mockResolvedValue([]),
          close: vi.fn().mockResolvedValue(undefined),
        };
      }),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    const debugLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const debugInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await client.initialize();

    const invoke = vi.fn().mockResolvedValue({ ok: true });
    client.clientTools = [{ name: 'serverA.tool1', schema: {}, invoke }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(true),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    client.client = {};

    const res = await client.mcpExecuteTool('serverA.tool1', [{ pin: 1234 }], 'call-1');

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ ok: true });
    expect(res.toolCallId).toBe('call-1');
    expect(client.mcpToolState.recordToolUsage).toHaveBeenCalledWith('serverA', 'tool1');
    expect(invoke).toHaveBeenCalledWith([{ pin: 1234 }]);
    if (debug) {
      expect(debugLogSpy).toHaveBeenCalledWith('Executing MCP tool:', {
        toolName: '[REDACTED]',
      });
      expect(debugLogSpy).toHaveBeenCalledWith('MCP tool executed successfully:', {
        toolName: '[REDACTED]',
      });
      expect(JSON.stringify(debugLogSpy.mock.calls)).not.toMatch(/1234|pin|serverA|tool1/);
    } else {
      expect(debugLogSpy).not.toHaveBeenCalled();
      expect(debugInfoSpy).not.toHaveBeenCalled();
    }
  });

  it('returns error when parameter validation fails', async () => {
    vi.resetModules();
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));
    vi.doMock('./MCPToolStateStore', () => ({
      parseServerNameToolName: vi
        .fn()
        .mockReturnValue({ serverName: 'serverA', toolName: 'tool1' }),
      validateToolArgs: vi.fn().mockReturnValue({ valid: false, error: 'bad-params' }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {
          initialize: vi.fn(),
          initConfigFromClientTools: vi.fn(),
        };
      }),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;

    // ensure the client is initialized so mcpExecuteTool follows the normal execution path
    await client.initialize();

    client.clientTools = [{ name: 'serverA.tool1', schema: {}, invoke: vi.fn() }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(true),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    // provide a minimal client object so mcpExecuteTool does not early-return
    client.client = {};

    const res = await client.mcpExecuteTool('serverA.tool1', [], 'call-2');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Parameter validation failed: bad-params/);
    expect(res.toolCallId).toBe('call-2');
  });

  it('returns error when tool is disabled', async () => {
    vi.resetModules();
    vi.doMock('./MCPToolStateStore', () => ({
      parseServerNameToolName: vi.fn().mockReturnValue({ serverName: 's', toolName: 't' }),
      validateToolArgs: vi.fn().mockReturnValue({ valid: true }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {};
      }),
    }));

    const client = new MCPClient(cfgPath, settingsPath) as any;

    client.clientTools = [{ name: 's.t', schema: {}, invoke: vi.fn() }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(false),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    client.client = {};

    const res = await client.mcpExecuteTool('s.t', [], 'call-3');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/disabled/);
    expect(res.toolCallId).toBe('call-3');
  });

  it('returns error when tool not found', async () => {
    vi.resetModules();
    vi.doMock('./MCPToolStateStore', () => ({
      parseServerNameToolName: vi.fn().mockReturnValue({ serverName: 'srv', toolName: 'missing' }),
      validateToolArgs: vi.fn().mockReturnValue({ valid: true }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {};
      }),
    }));

    const client = new MCPClient(cfgPath, settingsPath) as any;

    // clientTools does not contain the requested tool
    client.clientTools = [{ name: 'srv.other', schema: {}, invoke: vi.fn() }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(true),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    // provide a minimal client object so mcpExecuteTool does not early-return
    client.client = {};

    const res = await client.mcpExecuteTool('srv.missing', [], 'call-4');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not found/);
    expect(res.toolCallId).toBe('call-4');
  });

  it('returns undefined when mcpToolState is not set', async () => {
    vi.resetModules();
    // Keep default behavior for parse/validate but it's irrelevant here
    vi.doMock('./MCPToolStateStore', () => ({
      parseServerNameToolName: vi.fn().mockReturnValue({ serverName: 'x', toolName: 'y' }),
      validateToolArgs: vi.fn().mockReturnValue({ valid: true }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {};
      }),
    }));

    const client = new MCPClient(cfgPath, settingsPath) as any;

    client.clientTools = [{ name: 'x.y', schema: {}, invoke: vi.fn() }];
    client.mcpToolState = null;
    client.isInitialized = true;

    const res = await client.mcpExecuteTool('x.y', [], 'call-5');
    expect(res).toBeUndefined();
  });

  it.each([
    ['nullable string', { type: ['string', 'null'] }, null],
    ['null-only union', { type: ['null'] }, null],
    ['nullable integer', { type: ['integer', 'null'] }, 3],
    ['unconstrained value', {}, null],
    ['enum allowing null', { enum: ['all', null] }, null],
    ['allOf allowing null', { allOf: [{}, { type: ['string', 'null'] }] }, null],
    ['oneOf allowing null', { oneOf: [{}, { type: 'string' }] }, null],
  ])('executes a required %s using real validateToolArgs', async (_name, propSchema, value) => {
    vi.resetModules();
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));
    const realStore = await vi.importActual<typeof import('./MCPToolStateStore')>(
      './MCPToolStateStore'
    );
    vi.doMock('./MCPToolStateStore', () => ({
      ...realStore,
      parseServerNameToolName: vi
        .fn()
        .mockReturnValue({ serverName: 'serverA', toolName: 'tool1' }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {
          initialize: vi.fn(),
          initConfigFromClientTools: vi.fn(),
        };
      }),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();

    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: propSchema,
      },
    };
    client.clientTools = [{ name: 'serverA.tool1', schema, invoke }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(true),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    client.client = {};

    const res = await client.mcpExecuteTool(
      'serverA.tool1',
      { selector: value },
      'call-nullable-1'
    );
    expect(res.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith({ selector: value });
  });

  it.each([
    [
      'omitted parameter',
      { type: ['string', 'null'] },
      {},
      /Required parameter 'selector' is missing/,
    ],
    ['fractional integer', { type: ['integer', 'null'] }, { selector: 3.5 }, /got number/],
    [
      'non-null value for a null-only union',
      { type: ['null'] },
      { selector: 'unexpected' },
      /should be a null/,
    ],
    [
      'allOf excluding null',
      { allOf: [{ type: ['string', 'null'] }, { type: 'string' }] },
      { selector: null },
      /got null/,
    ],
    [
      'oneOf matching twice',
      { oneOf: [{ type: ['string', 'null'] }, { type: 'null' }] },
      { selector: null },
      /got null/,
    ],
  ])('does not invoke the tool for a required %s', async (_name, propSchema, args, error) => {
    vi.resetModules();
    vi.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: vi.fn().mockReturnValue({}),
      hasClusterDependentServers: vi.fn().mockReturnValue(false),
    }));
    const realStore = await vi.importActual<typeof import('./MCPToolStateStore')>(
      './MCPToolStateStore'
    );
    vi.doMock('./MCPToolStateStore', () => ({
      ...realStore,
      parseServerNameToolName: vi
        .fn()
        .mockReturnValue({ serverName: 'serverA', toolName: 'tool1' }),
      MCPToolStateStore: vi.fn().mockImplementation(function () {
        return {
          initialize: vi.fn(),
          initConfigFromClientTools: vi.fn(),
        };
      }),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;
    await client.initialize();

    const invoke = vi.fn().mockResolvedValue({ ok: true });
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: propSchema,
      },
    };
    client.clientTools = [{ name: 'serverA.tool1', schema, invoke }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(true),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    client.client = {};

    const res = await client.mcpExecuteTool('serverA.tool1', args, 'call-nullable-2');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(error);
    expect(invoke).not.toHaveBeenCalled();
  });
});
