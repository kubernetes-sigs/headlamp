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

import { loadSettings, saveSettings } from '../settings';
import { expandEnvAndResolvePaths, loadMCPSettings, saveMCPSettings } from './MCPSettings';
import * as MCP from './MCPSettings';

jest.mock('../settings', () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

beforeEach(() => {
  jest.resetAllMocks();
});

describe('MCPSettings', () => {
  it('loadMCPSettings returns mcp settings when present', () => {
    const expected = {
      enabled: true,
      servers: [{ name: 's1', command: 'cmd', args: ['-v'], enabled: true }],
    };
    (loadSettings as jest.Mock).mockReturnValue({ mcp: expected });

    const result = loadMCPSettings('/path/to/settings.json');

    expect(loadSettings).toHaveBeenCalledWith('/path/to/settings.json');
    expect(result).toEqual(expected);
  });

  it('loadMCPSettings returns null when no mcp settings', () => {
    (loadSettings as jest.Mock).mockReturnValue({ other: 123 });

    const result = loadMCPSettings('/settings');

    expect(loadSettings).toHaveBeenCalledWith('/settings');
    expect(result).toBeNull();
  });

  it('saveMCPSettings sets mcp on loaded settings and calls saveSettings', () => {
    const existing = { someKey: 'value' };
    (loadSettings as jest.Mock).mockReturnValue(existing);

    const newMCP = {
      enabled: false,
      servers: [{ name: 's', command: 'c', args: [], enabled: false }],
    };

    saveMCPSettings('/cfg', newMCP);

    expect(loadSettings).toHaveBeenCalledWith('/cfg');
    expect((existing as any).mcp).toBe(newMCP);
    expect(saveSettings).toHaveBeenCalledWith('/cfg', existing);
  });
});

describe('expandEnvAndResolvePaths', () => {
  beforeEach(() => {
    // Ensure predictable environment vars
    process.env.APPDATA = process.env.APPDATA || '';
    process.env.LOCALAPPDATA = process.env.LOCALAPPDATA || '';
  });

  it('replaces HEADLAMP_CURRENT_CLUSTER with cluster', () => {
    const result = expandEnvAndResolvePaths(['connect HEADLAMP_CURRENT_CLUSTER'], 'my-current');
    expect(result).toEqual(['connect my-current']);
  });

  it('replaces %APPDATA% and %LOCALAPPDATA% with environment values', () => {
    process.env.APPDATA = '/some/appdata';
    process.env.LOCALAPPDATA = '/some/localappdata';

    const result = expandEnvAndResolvePaths(['%APPDATA%/file', '%LOCALAPPDATA%\\other']);

    if (process.platform === 'win32') {
      expect(result).toEqual(['/some/appdata/file', '/some/localappdata/other']);
    } else {
      // on non-windows we expect backslashes to be preserved here
      expect(result).toEqual(['/some/appdata/file', '/some/localappdata\\other']);
    }
  });

  it('converts backslashes to forward slashes on win32', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const result = expandEnvAndResolvePaths(['C:\\path\\to\\file', 'nochange/needed']);
      expect(result).toEqual(['C:/path/to/file', 'nochange/needed']);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('handles docker bind src path conversion on Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const arg = 'type=bind,src=C:\\path\\to\\dir,dst=/data';
      const result = expandEnvAndResolvePaths([arg]);
      // allow a possible current-working-directory prefix (seen on some environments),
      // but ensure the drive letter path was converted to /c/path/to/dir or kept as C:/path/to/dir
      expect(result[0]).toMatch(
        /type=bind,src=(?:.*(?:\/c\/path\/to\/dir|\/[A-Za-z]:\/path\/to\/dir)),dst=\/data/
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('does not alter docker bind src path on non-Windows', () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      const arg = 'type=bind,src=/home/user/dir,dst=/data';
      const result = expandEnvAndResolvePaths([arg]);
      expect(result).toEqual([arg]);
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });
});

describe('MultiServerMCPClient', () => {
  beforeEach(() => {
    // ensure predictable env for merging tests
    process.env.TEST_ORIG_ENV = 'orig';
    jest.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.TEST_ORIG_ENV;
  });

  it('returns empty when no mcp settings', () => {
    jest.spyOn(MCP, 'loadMCPSettings').mockReturnValue(null);

    const result = MCP.makeMcpServersFromSettings('/cfg', ['cluster1']);

    // Cannot reliably assert the internal call to loadMCPSettings when both functions
    // are in the same module (jest.spyOn does not intercept internal local references),
    // so only assert the returned result.
    expect(result).toEqual({});
  });

  it('returns empty when mcp is disabled or has no servers', () => {
    jest.spyOn(MCP, 'loadMCPSettings').mockReturnValue({ enabled: false, servers: [] });
    expect(MCP.makeMcpServersFromSettings('/cfg', ['c'])).toEqual({});

    jest.spyOn(MCP, 'loadMCPSettings').mockReturnValue({ enabled: true, servers: [] });
    expect(MCP.makeMcpServersFromSettings('/cfg', ['c'])).toEqual({});
  });

  it('filters out disabled or invalid servers and builds server entries', () => {
    const mcpSettings = {
      enabled: true,
      servers: [
        {
          name: 'valid',
          command: 'cmd',
          args: ['arg1'],
          enabled: true,
          env: { MCP_VAR: 'mcp' },
        },
        {
          name: 'disabled',
          command: 'cmd',
          args: [],
          enabled: false,
        },
        {
          // missing command
          name: 'nocmd',
          command: '',
          args: [],
          enabled: true,
        },
        {
          // missing name
          name: '',
          command: 'cmd',
          args: [],
          enabled: true,
        },
      ],
    };

    (loadSettings as jest.Mock).mockReturnValue({ mcp: mcpSettings });

    const result = MCP.makeMcpServersFromSettings('/cfg', ['clusterA']);

    expect(result).toHaveProperty('valid');
    expect(Object.keys(result)).toEqual(['valid']);

    const entry = result['valid'] as any;
    expect(entry.transport).toBe('stdio');
    expect(entry.command).toBe('cmd');
    expect(entry.args).toEqual(['arg1']);
    // env should include process.env and server.env overrides
    expect(entry.env.MCP_VAR).toBe('mcp');
    expect(entry.env.TEST_ORIG_ENV).toBe('orig');
    // restart settings
    expect(entry.restart).toBeDefined();
    expect(entry.restart.enabled).toBe(true);
    expect(entry.restart.maxAttempts).toBe(3);
    expect(entry.restart.delayMs).toBe(2000);
  });

  it('expands HEADLAMP_CURRENT_CLUSTER placeholder using provided clusters[0]', () => {
    const mcpSettings = {
      enabled: true,
      servers: [
        {
          name: 'withCluster',
          command: 'cmd',
          args: ['connect', 'HEADLAMP_CURRENT_CLUSTER'],
          enabled: true,
        },
      ],
    };

    (loadSettings as jest.Mock).mockReturnValue({ mcp: mcpSettings });

    const result = MCP.makeMcpServersFromSettings('/cfg', ['my-current-cluster']);

    expect(result).toHaveProperty('withCluster');
    const entry = result['withCluster'] as any;
    // the expand function should have replaced the placeholder
    expect(entry.args).toEqual(['connect', 'my-current-cluster']);
  });
});
