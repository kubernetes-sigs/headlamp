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
import { findCommandCapability, getDeclaredCommandScopes } from './commandCapabilities';

describe('getDeclaredCommandScopes', () => {
  it('reads exact command and argument-prefix scopes', () => {
    expect(
      getDeclaredCommandScopes({
        headlamp: {
          runCommands: [{ command: 'kubectl', args: ['get'] }, { command: 'az' }],
        },
      })
    ).toEqual([
      { command: 'kubectl', args: ['get'] },
      { command: 'az', args: [] },
    ]);
  });

  it('ignores malformed scopes', () => {
    expect(
      getDeclaredCommandScopes({
        headlamp: {
          runCommands: [
            { command: '../shell', args: [] },
            { command: 'kubectl', args: 'get' },
            { command: 'az', args: ['account'] },
          ],
        },
      })
    ).toEqual([{ command: 'az', args: ['account'] }]);
  });

  it.each([
    null,
    {},
    { headlamp: null },
    { headlamp: {} },
    { headlamp: { runCommands: 'gh' } },
    { headlamp: { runCommands: Array.from({ length: 65 }, () => ({ command: 'gh' })) } },
  ])('returns no scopes for invalid package metadata', packageInfo => {
    expect(getDeclaredCommandScopes(packageInfo)).toEqual([]);
  });

  it('rejects oversized and unsafe arguments', () => {
    expect(
      getDeclaredCommandScopes({
        headlamp: {
          runCommands: [
            { command: 'a'.repeat(129), args: [] },
            { command: 'gh', args: Array.from({ length: 17 }, () => 'arg') },
            { command: 'gh', args: ['a'.repeat(257)] },
            { command: 'gh', args: ['bad\0argument'] },
          ],
        },
      })
    ).toEqual([]);
  });
});

describe('findCommandCapability', () => {
  const capabilities = [
    { command: 'kubectl', args: ['get'], capability: 'get-capability' },
    { command: 'kubectl', args: ['delete'], capability: 'delete-capability' },
  ];

  it('matches a declared argument prefix', () => {
    expect(findCommandCapability(capabilities, 'kubectl', ['get', 'pods'])).toBe('get-capability');
  });

  it('rejects a command outside the declared scope', () => {
    expect(findCommandCapability(capabilities, 'kubectl', ['apply', '-f', 'pod.yaml'])).toBe(
      undefined
    );
  });

  it('does not expose capabilities through mutable array methods', () => {
    const originalFind = Array.prototype.find;
    const originalEvery = Array.prototype.every;
    let mutableMethodCalled = false;

    Array.prototype.find = (() => {
      mutableMethodCalled = true;
      return undefined;
    }) as typeof Array.prototype.find;
    Array.prototype.every = (() => {
      mutableMethodCalled = true;
      return false;
    }) as unknown as typeof Array.prototype.every;

    let capability: string | undefined;
    try {
      capability = findCommandCapability(capabilities, 'kubectl', ['get', 'pods']);
    } finally {
      Array.prototype.find = originalFind;
      Array.prototype.every = originalEvery;
    }

    expect(mutableMethodCalled).toBe(false);
    expect(capability).toBe('get-capability');
  });
});
