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

import MCPClient from './MCPClient';

describe('MCPClient', () => {
  let client: MCPClient;
  let infoSpy: jest.Mock;

  beforeEach(() => {
    client = new MCPClient();
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
});
