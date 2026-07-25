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

function tmpPath(): string {
  return path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random()}.json`);
}

describe('MCPClient', () => {
  let client: MCPClient;
  let infoSpy: Mock;

  let cfgPath: string;
  let settingsPath: string;

  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws from handleClustersChange if not initialized', async () => {
    await expect(client.handleClustersChange(['cluster-a'])).rejects.toThrow(
      'MCPClient: not initialized'
    );
  });

  it('initialize is idempotent and logs exactly once', async () => {
    await client.initialize();
    await client.initialize(); // second call should be a no-op

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith('MCPClient: initialized');
  });

  it('config is set after initialize', async () => {
    expect((client as any).mcpToolState).toBeNull();
    await client.initialize();
    expect((client as any).mcpToolState).not.toBeNull();
  });

  it('handleClustersChange resolves when initialized and logs clusters', async () => {
    await client.initialize();
    await expect(client.handleClustersChange(['cluster-1'])).resolves.toBeUndefined();

    // initialize + clusters change => at least two calls
    expect(infoSpy).toHaveBeenCalledWith('MCPClient: clusters changed ->', ['cluster-1']);
  });

  it('setMainWindow accepts a BrowserWindow-like object and cleanup resets state', async () => {
    // use a minimal fake to represent BrowserWindow
    const fakeWin = { id: 42 } as unknown as Electron.BrowserWindow;

    await client.initialize();
    client.setMainWindow(fakeWin);

    // handleClustersChange should work when initialized
    await expect(client.handleClustersChange(['c-x'])).resolves.toBeUndefined();

    // cleanup should reset initialized and log cleanup
    await client.cleanup();
    expect(infoSpy).toHaveBeenCalledWith('MCPClient: cleaned up');

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

  it('initialize marks isInitialized and leaves client null when no servers are configured', async () => {
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

    expect((client as any).isInitialized).toBe(true);
    expect((client as any).client).toBeNull();
    // ensure the public log happened
    expect(infoSpy).toHaveBeenCalledWith('MCPClient: initialized');
  });

  it('initialize constructs MCP client and caches tools when servers exist', async () => {
    const fakeTools = [{ name: 't1' }, { name: 't2' }];
    const getTools = vi.fn().mockResolvedValue(fakeTools);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(() => ({ getTools, close }));

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

    // Ensure the mock constructor was called to create the client
    expect(MultiServerMCPClientMock).toHaveBeenCalled();
    // Ensure tools were cached
    expect((client as any).clientTools).toEqual(fakeTools);
    // Ensure MCPToolStateStore was initialized (non-null)
    expect((client as any).mcpToolState).not.toBeNull();
  });

  it('handleClustersChange logs and returns early when no cluster-dependent servers', async () => {
    const getTools = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(() => ({ getTools, close }));

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

    const beforeClient = (client as any).client;

    await client.handleClustersChange(['cluster-x']);

    // since hasClusterDependentServers returned false, client unchanged
    expect((client as any).client).toBe(beforeClient);
  });

  it('handleClustersChange does nothing when clusters array is identical', async () => {
    const getTools = vi.fn().mockResolvedValue([]);
    const close = vi.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = vi.fn().mockImplementation(() => ({ getTools, close }));

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

    // set currentClusters to a value and call with the same value
    (client as any).currentClusters = ['same-cluster'];

    vi.spyOn(console, 'info').mockImplementation(() => {});
    const closeSpy = vi.spyOn((client as any).client, 'close').mockImplementation(async () => {});

    await client.handleClustersChange(['same-cluster']);

    // close should not have been called because clusters didn't change
    expect(closeSpy).not.toHaveBeenCalled();
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
    const MultiServerMCPClientMock = vi.fn().mockImplementation(() => instances.shift());

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

    // initial client should be the first instance
    const firstClientRef = (client as any).client;
    expect(firstClientRef).not.toBeNull();

    // Trigger cluster change: should create a new client for the new cluster
    await client.handleClustersChange(['new-cluster']);

    // The MCP client constructor should have been called for initial setup and again for restart
    expect(MultiServerMCPClientMock).toHaveBeenCalledTimes(2);

    // After restart, client should have been replaced
    const afterClientRef = (client as any).client;
    expect(afterClientRef).not.toBeNull();
    // And tools should reflect second initialization
    expect((client as any).clientTools).toEqual([{ name: 'b' }]);
  });
});

describe('MCPClient logging behavior', () => {
  it('logs clusters change even when not initialized', async () => {
    const cfgPath = path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random()}.json`);
    const { default: MCPClientLocal } = await import('./MCPClient');
    const client = new MCPClientLocal(cfgPath, cfgPath) as InstanceType<
      typeof import('./MCPClient').default
    >;

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {}) as unknown as Mock;

    await expect(client.handleClustersChange(['cluster-log'])).rejects.toThrow(
      'MCPClient: not initialized'
    );

    expect(infoSpy).toHaveBeenCalledWith('MCPClient: clusters changed ->', ['cluster-log']);

    infoSpy.mockRestore();
  });
});

describe('MCPClient#mcpExecuteTool', () => {
  const cfgPath = tmpPath();
  const settingsPath = tmpPath();

  beforeEach(() => {
    try {
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
    } catch {}
    try {
      if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    } catch {}
  });

  it('executes a tool successfully and records usage', async () => {
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
      MCPToolStateStore: vi.fn().mockImplementation(() => ({
        // initialize config from client tools is invoked during MCPClient.initialize
        // provide a no-op mock so tests that don't assert this behavior don't fail
        initConfigFromClientTools: vi.fn(),
      })),
    }));

    // Ensure initialize can construct a client with getTools/close methods
    vi.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: vi.fn().mockImplementation(() => ({
        getTools: vi.fn().mockResolvedValue([]),
        close: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    const { default: MCPClient } = await import('./MCPClient');
    const client = new MCPClient(cfgPath, settingsPath) as any;

    await client.initialize();

    const invoke = vi.fn().mockResolvedValue({ ok: true });
    client.clientTools = [{ name: 'serverA.tool1', schema: {}, invoke }];
    client.mcpToolState = {
      isToolEnabled: vi.fn().mockReturnValue(true),
      recordToolUsage: vi.fn(),
    };
    client.isInitialized = true;
    client.client = {};

    const res = await client.mcpExecuteTool('serverA.tool1', [{ a: 1 }], 'call-1');

    expect(res.success).toBe(true);
    expect(res.result).toEqual({ ok: true });
    expect(res.toolCallId).toBe('call-1');
    expect(client.mcpToolState.recordToolUsage).toHaveBeenCalledWith('serverA', 'tool1');
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
      MCPToolStateStore: vi.fn().mockImplementation(() => ({
        initConfigFromClientTools: vi.fn(),
      })),
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
      MCPToolStateStore: vi.fn().mockImplementation(() => ({})),
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
      MCPToolStateStore: vi.fn().mockImplementation(() => ({})),
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
      MCPToolStateStore: vi.fn().mockImplementation(() => ({})),
    }));

    const client = new MCPClient(cfgPath, settingsPath) as any;

    client.clientTools = [{ name: 'x.y', schema: {}, invoke: vi.fn() }];
    client.mcpToolState = null;
    client.isInitialized = true;

    const res = await client.mcpExecuteTool('x.y', [], 'call-5');
    expect(res).toBeUndefined();
  });
});
