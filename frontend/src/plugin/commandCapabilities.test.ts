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

import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { PluginRunCommand } from '../components/App/runCommand';
import {
  commandCapabilityRegistration,
  createPluginRunCommand,
  findCommandCapability,
  pluginSourceDigest,
  preparePluginCommandCapabilities,
} from './commandCapabilities';
import { PluginInfo } from './pluginsSlice';

const plugin: PluginInfo = {
  name: '@example/plugin',
  folderName: 'example-plugin',
  source: 'shipped',
  type: 'shipped',
  description: '',
  homepage: '',
};

describe('commandCapabilityRegistration', () => {
  const sourceDigest = 'a'.repeat(64);

  it('preserves package, bundle, path, and provenance', () => {
    expect(
      commandCapabilityRegistration(plugin, 'static-plugins/example-plugin', sourceDigest)
    ).toEqual({
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      path: 'static-plugins/example-plugin',
      source: 'shipped',
      type: 'shipped',
      sourceDigest,
    });
  });

  it('rejects incomplete inventory metadata', () => {
    expect(
      commandCapabilityRegistration({ ...plugin, source: undefined }, 'path', sourceDigest)
    ).toBeUndefined();
    expect(
      commandCapabilityRegistration({ ...plugin, folderName: undefined }, 'path', sourceDigest)
    ).toBeUndefined();
    expect(commandCapabilityRegistration(plugin, 'path', 'invalid')).toBeUndefined();
  });

  it('hashes the exact cached source', async () => {
    await expect(pluginSourceDigest('console.log("trusted");')).resolves.toBe(
      'dd746362bdf7510734ba74a34f15e2a6a625e7e044efb0bc38da54b7cc316084'
    );
  });
});

describe('findCommandCapability', () => {
  const capabilities = [
    {
      bundleName: 'example-plugin',
      packageName: '@example/plugin',
      capability: 'secret',
    },
  ];

  it('matches both package and bundle identity', () => {
    expect(findCommandCapability(capabilities, plugin)).toBe('secret');
  });

  it('does not match a spoofed package or bundle', () => {
    expect(
      findCommandCapability(capabilities, { ...plugin, name: '@attacker/plugin' })
    ).toBeUndefined();
    expect(
      findCommandCapability(capabilities, { ...plugin, folderName: 'attacker' })
    ).toBeUndefined();
  });
});

describe('preparePluginCommandCapabilities', () => {
  it('does not hash plugin sources outside Electron', async () => {
    const sourceDigest = vi.fn();

    await expect(
      preparePluginCommandCapabilities(
        undefined,
        [plugin],
        ['static-plugins/example-plugin'],
        ['plugin source'],
        sourceDigest
      )
    ).resolves.toEqual([]);
    expect(sourceDigest).not.toHaveBeenCalled();
  });

  it('registers source-bound claims through the Electron bridge', async () => {
    const capabilities = [
      { bundleName: 'example-plugin', packageName: '@example/plugin', capability: 'secret' },
    ];
    const bridge = { register: vi.fn().mockResolvedValue(capabilities) };

    await expect(
      preparePluginCommandCapabilities(
        bridge,
        [plugin],
        ['static-plugins/example-plugin'],
        ['plugin source'],
        vi.fn().mockResolvedValue('a'.repeat(64))
      )
    ).resolves.toEqual(capabilities);
    expect(bridge.register).toHaveBeenCalledWith([
      expect.objectContaining({
        bundleName: 'example-plugin',
        packageName: '@example/plugin',
        sourceDigest: 'a'.repeat(64),
      }),
    ]);
  });
});

describe('createPluginRunCommand', () => {
  it('exposes only command, arguments, and empty options to plugins', () => {
    expectTypeOf<PluginRunCommand>().parameters.toEqualTypeOf<
      [command: string, args: string[], options: Record<string, never>]
    >();
  });

  it('forwards the private capability through the captured bridge', () => {
    const internalRunCommand = vi.fn(() => ({ stdout: {}, stderr: {}, on: vi.fn() }));
    const send = vi.fn();
    const receive = vi.fn();
    const pluginRunCommand = createPluginRunCommand(
      'secret',
      internalRunCommand as any,
      {},
      send,
      receive
    );

    pluginRunCommand?.('examplectl', ['project', 'list'], {});

    expect(internalRunCommand).toHaveBeenCalledWith(
      'examplectl',
      ['project', 'list'],
      {},
      {},
      send,
      receive,
      'secret'
    );
  });

  it('does not create a bridge without a product capability', () => {
    expect(createPluginRunCommand(undefined, vi.fn() as any, {}, vi.fn(), vi.fn())).toBeUndefined();
  });
});
