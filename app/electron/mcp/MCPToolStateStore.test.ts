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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MCPToolStateStore } from './MCPToolStateStore';

function tmpPath(): string {
  return path.join(os.tmpdir(), `mcp-test-${Date.now()}-${Math.random()}.json`);
}

describe('MCPConfig', () => {
  let toolStatePath: string;

  beforeEach(() => {
    toolStatePath = tmpPath();
    try {
      if (fs.existsSync(toolStatePath)) fs.unlinkSync(toolStatePath);
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      if (fs.existsSync(toolStatePath)) fs.unlinkSync(toolStatePath);
    } catch {
      // ignore
    }
  });

  it('defaults to enabled for unknown server/tool', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();
    expect(toolState.isToolEnabled('cluster-x', 'tool-a')).toBe(true);
  });

  it('setToolEnabled updates state and getDisabled/getEnabled reflect it', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    toolState.setToolEnabled('cluster-a', 'tool-1', false);
    expect(toolState.isToolEnabled('cluster-a', 'tool-1')).toBe(false);
    expect(toolState.getDisabledTools('cluster-a')).toContain('tool-1');
    expect(toolState.getEnabledTools('cluster-a')).not.toContain('tool-1');

    toolState.setToolEnabled('cluster-a', 'tool-1', true);
    expect(toolState.isToolEnabled('cluster-a', 'tool-1')).toBe(true);
    expect(toolState.getEnabledTools('cluster-a')).toContain('tool-1');
  });

  it('recordToolUsage increments usageCount and sets lastUsed (in-memory)', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    toolState.recordToolUsage('cluster-u', 'tool-u');
    toolState.recordToolUsage('cluster-u', 'tool-u');

    const stats = toolState.getToolStats('cluster-u', 'tool-u');
    expect(stats).not.toBeNull();
    expect(stats?.usageCount).toBe(2);
    expect(stats?.lastUsed).toBeInstanceOf(Date);
  });

  it('persists enabled state and usage to disk across instances', async () => {
    const cfg1 = new MCPToolStateStore(toolStatePath);
    await cfg1.initialize();
    cfg1.setToolEnabled('cluster-p', 'tool-p', false);
    cfg1.recordToolUsage('cluster-p', 'tool-p');

    // create a fresh instance which loads from the same file
    const cfg2 = new MCPToolStateStore(toolStatePath);
    await cfg2.initialize();
    expect(cfg2.isToolEnabled('cluster-p', 'tool-p')).toBe(false);

    const stats = cfg2.getToolStats('cluster-p', 'tool-p');
    // After load from JSON, lastUsed becomes a string; usageCount should persist as number
    expect(stats?.usageCount).toBe(1);
    expect(
      typeof (stats as any)?.lastUsed === 'string' || (stats as any)?.lastUsed instanceof Date
    ).toBe(true);
  });

  it('initializeToolsConfig creates and updates schemas and descriptions', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    const schemaA = { type: 'object', properties: { a: { type: 'string' } } };
    toolState.initializeToolsConfig('srv', [
      { name: 'tool-x', inputSchema: schemaA, description: 'desc x' },
      { name: 'tool-y', inputSchema: { type: 'string' }, description: 'desc y' },
    ]);

    const s1 = toolState.getToolStats('srv', 'tool-x');
    expect(s1).not.toBeNull();
    expect((s1 as any).inputSchema).toEqual(schemaA);
    expect((s1 as any).description).toBe('desc x');

    // re-initialize with changed schema/description for tool-x
    const schemaA2 = { type: 'object', properties: { a: { type: 'number' } } };
    toolState.initializeToolsConfig('srv', [
      { name: 'tool-x', inputSchema: schemaA2, description: 'desc x updated' },
    ]);

    const s2 = toolState.getToolStats('srv', 'tool-x');
    expect((s2 as any).inputSchema).toEqual(schemaA2);
    expect((s2 as any).description).toBe('desc x updated');
  });

  it('replaceToolsConfig preserves enabled state and usageCount and removes missing tools', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    // create initial tools and modify state
    toolState.initializeToolsConfig('cluster-r', [
      { name: 'keep-tool', inputSchema: null, description: 'keep' },
      { name: 'drop-tool', inputSchema: null, description: 'drop' },
    ]);
    toolState.setToolEnabled('cluster-r', 'keep-tool', false);
    // increment usage for keep-tool
    toolState.recordToolUsage('cluster-r', 'keep-tool');
    toolState.recordToolUsage('cluster-r', 'keep-tool');

    // replace with only keep-tool (and maybe new-tool)
    toolState.replaceToolsConfig({
      'cluster-r': [
        { name: 'keep-tool', inputSchema: null, description: 'keep' },
        { name: 'new-tool', inputSchema: null, description: 'new' },
      ],
    });

    // dropped tool should be gone
    expect(toolState.getToolStats('cluster-r', 'drop-tool')).toBeNull();

    // keep-tool should preserve enabled and usageCount
    const keep = toolState.getToolStats('cluster-r', 'keep-tool');
    expect(keep).not.toBeNull();
    expect(keep?.usageCount).toBe(2);
    expect(keep?.enabled).toBe(false);

    // new-tool should exist with defaults
    const n = toolState.getToolStats('cluster-r', 'new-tool');
    expect(n).not.toBeNull();
    expect(n?.usageCount).toBe(0);
    expect(n?.enabled).toBe(true);
  });

  it('getConfig, setConfig, replaceConfig and resetConfig behave as expected', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    toolState.resetConfig();
    expect(Object.keys(toolState.getConfig())).toHaveLength(0);

    const newConf = {
      s1: {
        t1: { enabled: false, usageCount: 3, inputSchema: null, description: 'd' },
      },
    };
    toolState.setConfig(newConf);
    expect(toolState.getConfig()).toEqual(newConf);

    // replaceConfig should overwrite entirely
    const replaced = {
      s2: {
        t2: { enabled: true, usageCount: 0, inputSchema: null, description: '' },
      },
    };
    toolState.replaceConfig(replaced);
    expect(toolState.getConfig()).toEqual(replaced);

    // persisted to disk and load into new instance
    const toolState2 = new MCPToolStateStore(toolStatePath);
    await toolState2.initialize();
    expect(toolState2.getConfig()).toEqual(replaced);
  });
});
