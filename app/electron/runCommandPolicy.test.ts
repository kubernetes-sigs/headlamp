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

import { describe, expect, it } from 'vitest';
import {
  isRunCommandAllowed,
  matchesRunCommandGrant,
  parseRunCommandGrants,
} from './runCommandPolicy';

describe('parseRunCommandGrants', () => {
  it('normalizes valid grants', () => {
    expect(
      parseRunCommandGrants([
        { tool: 'examplectl', args: ['project', 'list'] },
        {
          tool: 'kubectl',
          args: ['get'],
          allowTrailingArgs: true,
        },
      ])
    ).toEqual([
      { tool: 'examplectl', args: ['project', 'list'] },
      {
        tool: 'kubectl',
        args: ['get'],
        allowTrailingArgs: true,
      },
    ]);
  });

  it.each<unknown[]>([
    [{ command: 'examplectl', args: ['list'] }],
    [{ tool: 'examplectl', args: ['list'], extra: true }],
    [
      {
        tool: 'examplectl',
        executable: { source: 'plugin', path: 'bin/examplectl' },
        args: ['list'],
      },
    ],
    [{ tool: '', args: ['list'] }],
    [{ tool: '/usr/bin/examplectl', args: ['list'] }],
    [{ tool: 'examplectl', args: [] }],
    [{ tool: 'examplectl', args: [''] }],
    [{ tool: 'examplectl', args: ['  '] }],
    [{ tool: 'examplectl', args: ['list'], allowTrailingArgs: 'yes' }],
    [{ tool: 'examplectl', executable: true, args: ['list'] }],
    [
      {
        tool: 'examplectl',
        executable: { source: 'system', path: 'bin/examplectl' },
        args: ['list'],
      },
    ],
    [{ tool: 'examplectl', executable: { source: 'plugin' }, args: ['list'] }],
    [
      {
        tool: 'examplectl',
        executable: { source: 'plugin', path: '../examplectl' },
        args: ['list'],
      },
    ],
    [
      {
        tool: 'examplectl',
        executable: { source: 'plugin', path: 'bin/other' },
        args: ['list'],
      },
    ],
  ])('rejects malformed grants: %j', grant => {
    expect(() => parseRunCommandGrants(grant)).toThrow();
  });

  it('rejects duplicate grants', () => {
    const grant = { tool: 'examplectl', args: ['project', 'list'] };
    expect(() => parseRunCommandGrants([grant, grant])).toThrow('Duplicate');
  });
});

describe('matchesRunCommandGrant', () => {
  const exact = { tool: 'examplectl', args: ['project', 'list'] };
  const prefix = { ...exact, allowTrailingArgs: true };

  it('matches an exact tool and argument sequence', () => {
    expect(matchesRunCommandGrant(exact, 'examplectl', ['project', 'list'])).toBe(true);
  });

  it.each<[string, string[]]>([
    ['examplectl2', ['project', 'list']],
    ['examplectl', ['project']],
    ['examplectl', ['project', 'delete']],
    ['examplectl', ['list', 'project']],
    ['examplectl', ['project', 'list', '--all']],
  ])('rejects an out-of-scope request', (tool, args) => {
    expect(matchesRunCommandGrant(exact, tool, args)).toBe(false);
  });

  it('allows arguments only after an explicitly trailing prefix', () => {
    expect(matchesRunCommandGrant(prefix, 'examplectl', ['project', 'list', '--all'])).toBe(true);
    expect(matchesRunCommandGrant(prefix, 'examplectl', ['project', 'delete'])).toBe(false);
  });
});

it('allows a request when one grant matches', () => {
  expect(
    isRunCommandAllowed(
      [
        { tool: 'examplectl', args: ['project', 'list'] },
        { tool: 'examplectl', args: ['version'] },
      ],
      'examplectl',
      ['version']
    )
  ).toBe(true);
});
