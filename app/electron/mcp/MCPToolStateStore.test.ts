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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MCPToolStateStore,
  parseServerNameToolName,
  summarizeMcpToolStateChanges,
  validateToolArgs,
} from './MCPToolStateStore';

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

describe('parseServerNameToolName', () => {
  it('returns default serverName when no separator is present', () => {
    const res = parseServerNameToolName('kubectl');
    expect(res.serverName).toBe('default');
    expect(res.toolName).toBe('kubectl');
  });

  it('splits server and tool when a single separator is present', () => {
    const res = parseServerNameToolName('myserver__helm');

    expect(res.serverName).toBe('myserver');
    expect(res.toolName).toBe('helm');
  });

  it('preserves additional separators in the toolName when multiple separators are present', () => {
    const res = parseServerNameToolName('myserver__helm__test');
    expect(res.serverName).toBe('myserver');
    expect(res.toolName).toBe('helm__test');
  });
});

describe('summarizeMcpToolStateChanges', () => {
  it('returns zero changes for identical empty configs', () => {
    const res = summarizeMcpToolStateChanges({}, {});
    expect(res.totalChanges).toBe(0);
    expect(res.summaryText).toBe('');
  });

  it('counts added enabled tools and includes them in ENABLE summary', () => {
    const current = {};
    const nw = {
      srv1: {
        'tool-a': { enabled: true },
      },
    };
    const res = summarizeMcpToolStateChanges(current, nw);
    // addedTools (1) + enabledTools (1) => total 2
    expect(res.totalChanges).toBe(2);
    expect(res.summaryText).toContain('✓ ENABLE (1)');
    expect(res.summaryText).toContain('tool-a (srv1)');
    expect(res.summaryText).not.toContain('✗ DISABLE');
  });

  it('counts removed tools even when no summary lines are produced', () => {
    const current = {
      srv1: {
        'tool-x': { enabled: true },
      },
    };
    const nw = {};
    const res = summarizeMcpToolStateChanges(current, nw);
    // removedTools (1) => total 1
    expect(res.totalChanges).toBe(1);
    // removed tools are not printed in summaryText, so should be empty
    expect(res.summaryText).toBe('');
  });

  it('detects enable/disable changes between configs', () => {
    const current = {
      srvA: {
        'tool-1': { enabled: true },
        'tool-2': { enabled: false },
      },
    };
    const nw = {
      srvA: {
        'tool-1': { enabled: false }, // changed to disabled
        'tool-2': { enabled: true }, // changed to enabled
      },
    };
    const res = summarizeMcpToolStateChanges(current, nw);
    // two changes (one disabled, one enabled)
    expect(res.totalChanges).toBe(2);
    expect(res.summaryText).toContain('✓ ENABLE (1): tool-2 (srvA)');
    expect(res.summaryText).toContain('✗ DISABLE (1): tool-1 (srvA)');
    // Ensure ENABLE and DISABLE sections are separated by a blank line
    expect(res.summaryText.split('\n\n').length).toBeGreaterThanOrEqual(2);
  });

  it('aggregates changes across multiple servers', () => {
    // This test verifies that summarizeMcpToolConfigChanges correctly
    // aggregates changes across multiple servers, counting:
    // - added tools (whether enabled or disabled),
    // - removed tools (which are counted but not included in the human-readable summary),
    // - tools that changed enabled state (enable -> disable and vice-versa).
    // It ensures both the numeric totals and the generated ENABLE/DISABLE summary
    // lines include the expected entries and server names.
    const current = {
      s1: { a: { enabled: true } },
      s2: { x: { enabled: false } },
    };
    const nw = {
      s1: { a: { enabled: false }, b: { enabled: true } }, // a->disabled, b added+enabled
      s2: {
        /* x removed */
      },
      s3: { y: { enabled: false } }, // new disabled
    };
    const res = summarizeMcpToolStateChanges(current, nw);
    // Changes: a (changed), b (added), x (removed), y (added)
    // enabledTools: b (added enabled) => 1
    // disabledTools: a (changed), y (added disabled) => 2
    // addedTools: b,y => 2
    // removedTools: x => 1
    // total = 1+2+2+1 = 6
    expect(res.totalChanges).toBe(6);
    expect(res.summaryText).toContain('✓ ENABLE (1)');
    expect(res.summaryText).toContain('✗ DISABLE (2)');
    expect(res.summaryText).toContain('b (s1)');
    expect(res.summaryText).toContain('a (s1)');
    expect(res.summaryText).toContain('y (s3)');
  });

  it('ignores non-enabled metadata-only changes (description/inputSchema)', () => {
    const current = {
      srvM: {
        'tool-meta': { enabled: true, description: 'old', inputSchema: { type: 'string' } },
      },
    };
    const nw = {
      srvM: {
        'tool-meta': { enabled: true, description: 'new', inputSchema: { type: 'string' } },
      },
    };
    const res = summarizeMcpToolStateChanges(current, nw);
    // Only metadata changed; enabled state unchanged => no counted changes
    expect(res.totalChanges).toBe(0);
    expect(res.summaryText).toBe('');
  });
});

describe('initConfigFromClientTools', () => {
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

  it('clears config when no client tools are provided', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    // Seed with some config
    toolState.setConfig({
      someServer: {
        someTool: { enabled: false, usageCount: 2, inputSchema: null, description: '' },
      },
    });
    expect(Object.keys(toolState.getConfig()).length).toBeGreaterThan(0);

    // init with empty client tools should clear the config
    toolState.initConfigFromClientTools([]);
    expect(Object.keys(toolState.getConfig())).toHaveLength(0);
  });

  it('groups tools by server, extracts schema and description, and sets defaults', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    const clientTools: any[] = [
      {
        name: 'srvA__tool-x',
        schema: { type: 'object', properties: { a: { type: 'string' } } },
        description: 'desc x',
      },
      { name: 'tool-no-server', description: 'global tool' }, // no schema provided
    ];

    toolState.initConfigFromClientTools(clientTools);

    const sx = toolState.getToolStats('srvA', 'tool-x');
    expect(sx).not.toBeNull();
    expect((sx as any).inputSchema).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
    expect((sx as any).description).toBe('desc x');
    expect(sx?.enabled).toBe(true);
    expect(sx?.usageCount).toBe(0);

    const gn = toolState.getToolStats('default', 'tool-no-server');
    expect(gn).not.toBeNull();
    expect((gn as any).inputSchema).toBeNull();
    expect((gn as any).description).toBe('global tool');
    expect(gn?.enabled).toBe(true);
  });

  it('preserves enabled state and usageCount from existing config when tool still exists', async () => {
    const toolState = new MCPToolStateStore(toolStatePath);
    await toolState.initialize();

    // Seed with a tool that has specific enabled/usage values
    toolState.setConfig({
      myServer: {
        preservedTool: {
          enabled: false,
          usageCount: 5,
          inputSchema: null,
          description: 'old desc',
        },
      },
    });

    // Client reports same tool (with updated schema/description)
    const clientTools: any[] = [
      { name: 'myServer__preservedTool', schema: { type: 'string' }, description: 'new desc' },
    ];

    toolState.initConfigFromClientTools(clientTools);

    const p = toolState.getToolStats('myServer', 'preservedTool');
    expect(p).not.toBeNull();
    // preserved values should remain
    expect(p?.enabled).toBe(false);
    expect(p?.usageCount).toBe(5);
    // schema/description should be updated from client tools
    expect((p as any).inputSchema).toEqual({ type: 'string' });
    expect((p as any).description).toBe('new desc');
  });
});

describe('validateToolArgs', () => {
  it('returns valid when schema is null', () => {
    const res = validateToolArgs(null, { any: 1 });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('fails when a required property is missing', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    };
    const res = validateToolArgs(schema, {});
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Required parameter 'name'");
  });

  it('fails when property type does not match (number expected)', () => {
    const schema = {
      type: 'object',
      properties: {
        age: { type: 'number' },
      },
    };
    const res = validateToolArgs(schema, { age: 'not-a-number' });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('should be a number');
  });

  it('validates array types correctly', () => {
    const schema = {
      type: 'object',
      properties: {
        items: { type: 'array' },
      },
    };
    const ok = validateToolArgs(schema, { items: [1, 2, 3] });
    expect(ok.valid).toBe(true);

    const notOk = validateToolArgs(schema, { items: 'not-an-array' });
    expect(notOk.valid).toBe(false);
    expect(notOk.error).toContain('should be an array');
  });

  it('validates object types and rejects arrays/null for object type', () => {
    const schema = {
      type: 'object',
      properties: {
        cfg: { type: 'object' },
      },
    };
    expect(validateToolArgs(schema, { cfg: { a: 1 } }).valid).toBe(true);
    const asArray = validateToolArgs(schema, { cfg: [1, 2] });
    expect(asArray.valid).toBe(false);
    expect(asArray.error).toContain('should be an object');
    const asNull = validateToolArgs(schema, { cfg: null });
    expect(asNull.valid).toBe(false);
    expect(asNull.error).toContain('should be an object');
  });

  it('treats unsupported property types as non-fatal and returns valid', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'integer' }, // unsupported type in validator
      },
    };
    const res = validateToolArgs(schema, { count: 42 });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('accepts null for a required parameter whose schema allows null', () => {
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: { type: ['string', 'null'] },
      },
    };
    const res = validateToolArgs(schema, { selector: null });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('accepts only null for a null-only type union', () => {
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: { selector: { type: ['null'] } },
    };

    expect(validateToolArgs(schema, { selector: null })).toEqual({ valid: true });
    for (const selector of ['unexpected', 0, false, [], {}]) {
      const res = validateToolArgs(schema, { selector });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Parameter 'selector' should be a null");
    }
  });

  it('accepts a valid string for a required nullable parameter', () => {
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: { type: ['string', 'null'] },
      },
    };
    const res = validateToolArgs(schema, { selector: 'my-selector' });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('rejects an omitted required nullable parameter as missing', () => {
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: { type: ['string', 'null'] },
      },
    };
    const res = validateToolArgs(schema, {});
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Required parameter 'selector' is missing");
  });

  it('rejects an invalid type for a required nullable parameter', () => {
    const schema = {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: { type: ['string', 'null'] },
      },
    };
    const res = validateToolArgs(schema, { selector: 42 });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('should be a string/null');
  });

  it('rejects null for a required non-nullable string parameter', () => {
    const schema = {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
      },
    };
    const res = validateToolArgs(schema, { name: null });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Parameter 'name' should be a string, got null");
  });

  it('accepts null for an optional nullable parameter', () => {
    const schema = {
      type: 'object',
      properties: {
        filter: { type: ['string', 'null'] },
      },
    };
    const res = validateToolArgs(schema, { filter: null });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it.each([
    ['an unconstrained schema', {}, true],
    ['a true schema', true, true],
    ['a false schema', false, false],
    ['an enum containing null', { enum: ['all', null] }, true],
    ['an enum excluding null', { enum: ['all'] }, false],
    ['a null constant', { const: null }, true],
    ['a non-null constant', { const: 'all' }, false],
    ['the nullable extension', { type: 'string', nullable: true }, true],
    ['nullable with an excluding enum', { type: 'string', nullable: true, enum: ['all'] }, false],
    [
      'allOf with a non-null branch',
      { allOf: [{ type: ['string', 'null'] }, { type: 'string' }] },
      false,
    ],
    ['allOf with an unconstrained branch', { allOf: [{}, { type: ['string', 'null'] }] }, true],
    [
      'oneOf with two matching branches',
      { oneOf: [{ type: ['string', 'null'] }, { type: 'null' }] },
      false,
    ],
    ['oneOf with an unconstrained matching branch', { oneOf: [{}, { type: 'string' }] }, true],
    ['oneOf with two unconstrained branches', { oneOf: [{}, {}] }, false],
    ['oneOf with no matching branch', { oneOf: [{ type: 'string' }, { type: 'number' }] }, false],
    ['anyOf with a matching branch', { anyOf: [{ type: 'string' }, { type: 'null' }] }, true],
    ['anyOf with no matching branch', { anyOf: [{ type: 'string' }, { type: 'number' }] }, false],
    ['a sibling type excluding null', { type: 'string', anyOf: [{ type: 'null' }] }, false],
    [
      'a nullable type with an excluding allOf',
      { type: ['string', 'null'], allOf: [{ type: 'string' }] },
      false,
    ],
    [
      'a nullable type with an excluding not',
      { type: ['string', 'null'], not: { const: null } },
      false,
    ],
    ['an unsupported type', { type: 'unsupported' }, true],
    ['a conditional schema', { if: {}, then: { type: 'null' }, else: { type: 'string' } }, true],
    ['an unresolved reference', { $ref: '#/$defs/selector' }, true],
    [
      'oneOf with an unresolved reference',
      { oneOf: [{ $ref: '#/$defs/selector' }, { type: 'null' }] },
      true,
    ],
    [
      'allOf with a known prohibition and a reference',
      { allOf: [{ type: 'string' }, { $ref: '#/$defs/selector' }] },
      false,
    ],
  ])('checks null against %s for required and optional parameters', (_name, propSchema, valid) => {
    for (const required of [[], ['selector']]) {
      const res = validateToolArgs(
        { type: 'object', required, properties: { selector: propSchema } },
        { selector: null }
      );
      expect(res.valid).toBe(valid);
      if (!valid) expect(res.error).toContain('got null');
    }
  });

  it.each([
    [3, true],
    [0, true],
    [3.5, false],
  ])('validates %s against an integer/null union', (count, valid) => {
    const res = validateToolArgs(
      { type: 'object', required: ['count'], properties: { count: { type: ['integer', 'null'] } } },
      { count }
    );
    expect(res.valid).toBe(valid);
    if (!valid) expect(res.error).toContain('should be a integer/null, got number');
  });

  it('preserves valid false, zero, and empty-string inputs', () => {
    const schema = {
      type: 'object',
      required: ['enabled', 'count', 'label'],
      properties: {
        enabled: { type: 'boolean' },
        count: { type: 'number' },
        label: { type: 'string' },
      },
    };
    const res = validateToolArgs(schema, { enabled: false, count: 0, label: '' });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });
});
