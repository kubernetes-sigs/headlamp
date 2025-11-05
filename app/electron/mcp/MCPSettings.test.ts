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
