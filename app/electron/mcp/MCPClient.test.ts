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
import MCPClient from './MCPClient';

function tmpPath(): string {
  return path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random()}.json`);
}

describe('MCPClient', () => {
  let client: MCPClient;
  let infoSpy: jest.Mock;

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
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {}) as unknown as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    jest.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: jest.fn().mockReturnValue({}),
      hasClusterDependentServers: jest.fn().mockReturnValue(false),
    }));
    // Mock MultiServerMCPClient just in case, it should not be constructed
    const MultiServerMCPClientMock = jest.fn();
    jest.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));

    const MCPClient = require('./MCPClient').default as typeof import('./MCPClient').default;
    const client = new MCPClient(cfgPath, settingsPath);

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    await client.initialize();

    expect((client as any).isInitialized).toBe(true);
    expect((client as any).client).toBeNull();
    // ensure the public log happened
    expect(infoSpy).toHaveBeenCalledWith('MCPClient: initialized');
  });

  it('initialize constructs MCP client and caches tools when servers exist', async () => {
    const fakeTools = [{ name: 't1' }, { name: 't2' }];
    const getTools = jest.fn().mockResolvedValue(fakeTools);
    const close = jest.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = jest.fn().mockImplementation(() => ({ getTools, close }));

    jest.resetModules();
    jest.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    jest.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: jest.fn().mockReturnValue({ serverA: { url: 'http://x' } }),
      hasClusterDependentServers: jest.fn().mockReturnValue(false),
    }));

    const MCPClient = require('./MCPClient').default as typeof import('./MCPClient').default;
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
    const getTools = jest.fn().mockResolvedValue([]);
    const close = jest.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = jest.fn().mockImplementation(() => ({ getTools, close }));

    jest.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    // make servers exist, but indicate no cluster-dependent servers
    const makeMcpServersFromSettings = jest.fn().mockReturnValue({ serverA: {} });
    const hasClusterDependentServers = jest.fn().mockReturnValue(false);
    jest.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers,
    }));

    const MCPClient = require('./MCPClient').default as typeof import('./MCPClient').default;
    const client = new MCPClient(cfgPath, settingsPath);

    await client.initialize();

    const beforeClient = (client as any).client;

    await client.handleClustersChange(['cluster-x']);

    // since hasClusterDependentServers returned false, client unchanged
    expect((client as any).client).toBe(beforeClient);
  });

  it('handleClustersChange does nothing when clusters array is identical', async () => {
    const getTools = jest.fn().mockResolvedValue([]);
    const close = jest.fn().mockResolvedValue(undefined);
    const MultiServerMCPClientMock = jest.fn().mockImplementation(() => ({ getTools, close }));

    jest.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    jest.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings: jest.fn().mockReturnValue({ serverA: {} }),
      hasClusterDependentServers: jest.fn().mockReturnValue(true),
    }));

    const MCPClient = require('./MCPClient').default as typeof import('./MCPClient').default;
    const client = new MCPClient(cfgPath, settingsPath);

    await client.initialize();

    // set currentClusters to a value and call with the same value
    (client as any).currentClusters = ['same-cluster'];

    jest.spyOn(console, 'info').mockImplementation(() => {});
    const closeSpy = jest.spyOn((client as any).client, 'close').mockImplementation(async () => {});

    await client.handleClustersChange(['same-cluster']);

    // close should not have been called because clusters didn't change
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('handleClustersChange restarts client when cluster-dependent servers exist', async () => {
    const getToolsFirst = jest.fn().mockResolvedValue([{ name: 'a' }]);
    const closeFirst = jest.fn().mockResolvedValue(undefined);
    const getToolsSecond = jest.fn().mockResolvedValue([{ name: 'b' }]);
    const closeSecond = jest.fn().mockResolvedValue(undefined);

    // We'll create a factory to return different instances on subsequent constructions
    const instances: any[] = [
      { getTools: getToolsFirst, close: closeFirst },
      { getTools: getToolsSecond, close: closeSecond },
    ];
    const MultiServerMCPClientMock = jest.fn().mockImplementation(() => instances.shift());

    // Ensure module cache is cleared so our doMock is respected when requiring the MCPClient module
    jest.resetModules();
    jest.doMock('@langchain/mcp-adapters', () => ({
      MultiServerMCPClient: MultiServerMCPClientMock,
    }));
    const makeMcpServersFromSettings = jest.fn().mockReturnValue({ serverA: {} });
    const hasClusterDependentServers = jest.fn().mockReturnValue(true);
    jest.doMock('./MCPSettings', () => ({
      makeMcpServersFromSettings,
      hasClusterDependentServers,
    }));

    const MCPClient = require('./MCPClient').default as typeof import('./MCPClient').default;
    const client = new MCPClient(cfgPath, settingsPath);

    jest.spyOn(console, 'log').mockImplementation(() => {});
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
    const client = new (require('./MCPClient').default)(cfgPath) as InstanceType<
      typeof import('./MCPClient').default
    >;

    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {}) as jest.Mock;

    await expect(client.handleClustersChange(['cluster-log'])).rejects.toThrow(
      'MCPClient: not initialized'
    );

    expect(infoSpy).toHaveBeenCalledWith('MCPClient: clusters changed ->', ['cluster-log']);

    infoSpy.mockRestore();
  });
});
