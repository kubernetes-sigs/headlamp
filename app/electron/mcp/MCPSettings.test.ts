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

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { loadSettings, saveSettings } from '../settings';
import { expandEnvAndResolvePaths, loadMCPSettings, saveMCPSettings } from './MCPSettings';
import * as MCP from './MCPSettings';

vi.mock('../settings', () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe('MCPSettings', () => {
  it('loadMCPSettings returns mcp settings when present', () => {
    const expected = {
      enabled: true,
      servers: [{ name: 's1', command: 'cmd', args: ['-v'], enabled: true }],
    };
    (loadSettings as Mock).mockReturnValue({ mcp: expected });

    const result = loadMCPSettings('/path/to/settings.json');

    expect(loadSettings).toHaveBeenCalledWith('/path/to/settings.json');
    expect(result).toEqual(expected);
  });

  it('loadMCPSettings returns null when no mcp settings', () => {
    (loadSettings as Mock).mockReturnValue({ other: 123 });

    const result = loadMCPSettings('/settings');

    expect(loadSettings).toHaveBeenCalledWith('/settings');
    expect(result).toBeNull();
  });

  it('saveMCPSettings sets mcp on loaded settings and calls saveSettings', () => {
    const existing = { someKey: 'value' };
    (loadSettings as Mock).mockReturnValue(existing);

    const newMCP = {
      enabled: false,
      servers: [{ name: 's', command: 'c', args: [], enabled: false }],
    };

    saveMCPSettings('/cfg', newMCP);

    expect(loadSettings).toHaveBeenCalledWith('/cfg');
    expect((existing as any).mcp).toMatchObject(newMCP);
    expect((existing as any).mcp.servers[0].permissions).toMatchObject({
      command: 'c',
      args: [],
      envKeys: [],
      clusterDependent: false,
      restart: {
        enabled: true,
        maxAttempts: 3,
        delayMs: 2000,
      },
    });
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
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.TEST_ORIG_ENV;
  });

  it('returns empty when no mcp settings', () => {
    vi.spyOn(MCP, 'loadMCPSettings').mockReturnValue(null);

    const result = MCP.makeMcpServersFromSettings('/cfg', ['cluster1']);

    // Cannot reliably assert the internal call to loadMCPSettings when both functions
    // are in the same module (vi.spyOn does not intercept internal local references),
    // so only assert the returned result.
    expect(result).toEqual({});
  });

  it('returns empty when mcp is disabled or has no servers', () => {
    vi.spyOn(MCP, 'loadMCPSettings').mockReturnValue({ enabled: false, servers: [] });
    expect(MCP.makeMcpServersFromSettings('/cfg', ['c'])).toEqual({});

    vi.spyOn(MCP, 'loadMCPSettings').mockReturnValue({ enabled: true, servers: [] });
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

    (loadSettings as Mock).mockReturnValue({
      mcp: MCP.withApprovedMCPPermissions(mcpSettings as any),
    });

    const result = MCP.makeMcpServersFromSettings('/cfg', ['clusterA']);

    expect(result).toHaveProperty('valid');
    expect(Object.keys(result)).toEqual(['valid']);

    const entry = result['valid'] as any;
    expect(entry.transport).toBe('stdio');
    expect(entry.command).toBe('cmd');
    expect(entry.args).toEqual(['arg1']);
    // env should include only approved explicit server.env values
    expect(entry.env.MCP_VAR).toBe('mcp');
    expect(entry.env.TEST_ORIG_ENV).toBeUndefined();
    // restart settings
    expect(entry.restart).toBeDefined();
    expect(entry.restart.enabled).toBe(true);
    expect(entry.restart.maxAttempts).toBe(3);
    expect(entry.restart.delayMs).toBe(2000);
  });

  it('skips enabled servers with unapproved broadened permissions', () => {
    const approved = MCP.withApprovedMCPPermissions({
      enabled: true,
      servers: [
        {
          name: 'changed',
          command: 'cmd',
          args: ['old'],
          enabled: true,
          env: { SAFE_VAR: 'ok' },
        },
      ],
    } as any);
    approved.servers[0].env = { SAFE_VAR: 'ok', NEW_SECRET: 'secret' };

    (loadSettings as Mock).mockReturnValue({ mcp: approved });

    const result = MCP.makeMcpServersFromSettings('/cfg', ['clusterA']);

    expect(result).toEqual({});
  });

  it('allows enabled servers with narrowed approved permissions', () => {
    const approved = MCP.withApprovedMCPPermissions({
      enabled: true,
      servers: [
        {
          name: 'narrowed',
          command: 'cmd',
          args: ['run'],
          enabled: true,
          env: { SAFE_VAR: 'ok', OPTIONAL_VAR: 'ok' },
        },
      ],
    } as any);
    approved.servers[0].env = { SAFE_VAR: 'ok' };

    (loadSettings as Mock).mockReturnValue({ mcp: approved });

    const result = MCP.makeMcpServersFromSettings('/cfg', ['clusterA']);

    expect(result).toHaveProperty('narrowed');
    expect((result['narrowed'] as any).env).toEqual({ SAFE_VAR: 'ok' });
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

    (loadSettings as Mock).mockReturnValue({
      mcp: MCP.withApprovedMCPPermissions(mcpSettings as any),
    });

    const result = MCP.makeMcpServersFromSettings('/cfg', ['my-current-cluster']);

    expect(result).toHaveProperty('withCluster');
    const entry = result['withCluster'] as any;
    // the expand function should have replaced the placeholder
    expect(entry.args).toEqual(['connect', 'my-current-cluster']);
  });
});

describe('mcpPermissionsCenter', () => {
  it('reports effective server permissions and recent tool usage', () => {
    const mcpSettings = MCP.withApprovedMCPPermissions({
      enabled: true,
      servers: [
        {
          name: 'cluster-tools',
          command: 'node',
          args: ['server.js', 'HEADLAMP_CURRENT_CLUSTER'],
          enabled: true,
          env: { TOKEN: 'value', PATH: '/bin' },
        },
      ],
    } as any);

    const result = MCP.mcpPermissionsCenter(mcpSettings, {
      'cluster-tools': {
        list: {
          enabled: true,
          lastUsed: '2026-07-23T10:00:00.000Z',
          usageCount: 2,
        },
        get: {
          enabled: true,
          lastUsed: new Date('2026-07-23T11:00:00.000Z'),
          usageCount: 1,
        },
      },
    });

    expect(result).toEqual([
      expect.objectContaining({
        serverName: 'cluster-tools',
        enabled: true,
        approved: true,
        command: 'node',
        args: ['server.js', 'HEADLAMP_CURRENT_CLUSTER'],
        envKeys: ['PATH', 'TOKEN'],
        approvedAt: expect.any(String),
        clusterDependent: true,
        restart: {
          enabled: true,
          maxAttempts: 3,
          delayMs: 2000,
        },
        recentToolUsage: [
          {
            toolName: 'get',
            lastUsed: '2026-07-23T11:00:00.000Z',
            usageCount: 1,
          },
          {
            toolName: 'list',
            lastUsed: '2026-07-23T10:00:00.000Z',
            usageCount: 2,
          },
        ],
      }),
    ]);
  });
});

describe('settingsChanges', () => {
  it('reports enabling and added servers when current is null', () => {
    const nextSettings = {
      enabled: true,
      servers: [{ name: 's1', command: 'cmd1', args: [], enabled: true }],
    };

    const result = MCP.settingsChanges(null, nextSettings as any);
    expect(result).toContain('• MCP will be ENABLED');
    expect(result).toContain('• ADD server: "s1" (cmd1)');
  });

  it('returns empty array when both current and next settings are null', () => {
    const result = MCP.settingsChanges(null, null as any);
    expect(result).toEqual([]);
  });

  it('reports disabling and removed servers when next is null', () => {
    const current = {
      enabled: true,
      servers: [
        { name: 's1', command: 'cmd1', args: [], enabled: true },
        { name: 's2', command: 'cmd2', args: [], enabled: true },
      ],
    };

    const result = MCP.settingsChanges(current as any, null as any);
    expect(result).toContain('• MCP will be DISABLED');
    expect(result).toContain('• REMOVE server: "s1"');
    expect(result).toContain('• REMOVE server: "s2"');
  });

  it('reports disabling when enabled -> disabled and no servers', () => {
    const current = { enabled: true, servers: [] };
    const next = { enabled: false, servers: [] };

    const result = MCP.settingsChanges(current as any, next as any);
    expect(result).toEqual(['• MCP will be DISABLED']);
  });

  it('detects added, removed and modified servers including command/args/env/enable changes', () => {
    const current = {
      enabled: true,
      servers: [
        { name: 'keep', command: 'cmd', args: ['a'], enabled: true, env: { X: '1' } },
        { name: 'removed', command: 'rm', args: [], enabled: true },
        { name: 'modified', command: 'old', args: ['one'], enabled: true, env: { A: 'a' } },
      ],
    };

    const next = {
      enabled: true,
      servers: [
        { name: 'keep', command: 'cmd', args: ['a'], enabled: true, env: { X: '1' } }, // unchanged
        { name: 'added', command: 'new', args: [], enabled: true }, // new
        {
          name: 'modified',
          command: 'newcmd',
          args: ['one', 'two'],
          enabled: false, // toggled
          env: { A: 'b' }, // changed
        },
      ],
    };

    const result = MCP.settingsChanges(current as any, next as any);

    expect(result).toEqual(
      expect.arrayContaining(['• ADD server: "added" (new)', '• REMOVE server: "removed"'])
    );

    // find the modify message for 'modified' server
    const modifyMsg = result.find(r => r.startsWith('• MODIFY server "modified"'));
    expect(modifyMsg).toBeDefined();
    // should mention enable/disable, command change, args change, and env change
    expect(modifyMsg).toMatch(/enable|disable/);
    expect(modifyMsg).toMatch(/change command: "old" → "newcmd"/);
    expect(modifyMsg).toMatch(/change arguments: \["one"\] → \["one","two"\]/);
    expect(modifyMsg).toMatch(/change environment variables/);
  });

  it('returns empty array when there are no changes', () => {
    const s = MCP.withApprovedMCPPermissions({
      enabled: true,
      servers: [{ name: 's', command: 'c', args: ['x'], enabled: true, env: { K: 'v' } }],
    } as any);

    const result = MCP.settingsChanges(s as any, s as any);
    expect(result).toEqual([]);
  });
});
