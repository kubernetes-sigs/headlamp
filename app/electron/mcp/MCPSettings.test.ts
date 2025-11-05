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
import { loadMCPSettings, saveMCPSettings } from './MCPSettings';

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
