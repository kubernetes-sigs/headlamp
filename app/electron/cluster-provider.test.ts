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

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createClusterProviderCapabilities,
  registerClusterProvider,
  setupClusterProviderHandlers,
} from './cluster-provider';

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup());
});

function register(provider: string, handler = vi.fn()) {
  cleanups.push(registerClusterProvider(provider, handler));
  return handler;
}

describe('cluster provider registration', () => {
  it('creates an opaque capability only for a registered provider', () => {
    register('example.cluster');

    const { capabilities, providerByCapability } = createClusterProviderCapabilities([
      { pluginName: '@example/plugin', providers: ['example.cluster', 'missing.cluster'] },
    ]);

    expect(capabilities['@example/plugin']).toEqual([
      { provider: 'example.cluster', capability: expect.stringMatching(/^[a-f0-9]{64}$/) },
    ]);
    expect(providerByCapability.get(capabilities['@example/plugin'][0].capability)).toBe(
      'example.cluster'
    );
  });

  it('rejects duplicate provider ownership', () => {
    register('example.cluster');
    expect(() => registerClusterProvider('example.cluster', vi.fn())).toThrow(
      'Cluster provider is already registered'
    );
  });

  it('ignores malformed registrations', () => {
    register('example.cluster');
    expect(
      createClusterProviderCapabilities([
        { pluginName: '../plugin', providers: ['example.cluster'] },
        { pluginName: 'example', providers: ['../provider'] },
      ]).capabilities
    ).toEqual({ example: [] });
  });
});

describe('cluster provider IPC', () => {
  function setup() {
    const handlers = new Map<string, (...args: any[]) => any>();
    const webContents = { on: vi.fn() };
    const removeHandler = vi.fn(channel => handlers.delete(channel));
    setupClusterProviderHandlers(
      { webContents } as any,
      {
        handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
        removeHandler,
      } as any
    );
    return {
      handlers,
      event: { sender: webContents },
      otherEvent: { sender: {} },
      removeHandler,
      webContents,
    };
  }

  it('invokes the provider associated with the capability', async () => {
    const handler = register('example.cluster', vi.fn().mockResolvedValue({ success: true }));
    const { handlers, event } = setup();
    const capabilities = await handlers.get('register-plugin-cluster-provider-capabilities')!(
      event,
      [{ pluginName: 'example', providers: ['example.cluster'] }]
    );

    await expect(
      handlers.get('invoke-cluster-provider')!(event, capabilities.example[0].capability, {
        cluster: 'demo',
      })
    ).resolves.toEqual({ success: true });
    expect(handler).toHaveBeenCalledWith({ cluster: 'demo' });
  });

  it('rejects another renderer and an unknown capability', async () => {
    register('example.cluster');
    const { handlers, event, otherEvent } = setup();
    const invoke = handlers.get('invoke-cluster-provider')!;

    await expect(invoke(otherEvent, 'a'.repeat(64), {})).resolves.toEqual({
      success: false,
      message: 'Invalid cluster provider capability or request',
    });
    await expect(invoke(event, 'a'.repeat(64), {})).resolves.toEqual({
      success: false,
      message: 'Invalid cluster provider capability or request',
    });
  });

  it('returns a generic error when the provider fails', async () => {
    register('example.cluster', vi.fn().mockRejectedValue(new Error('sensitive detail')));
    const { handlers, event } = setup();
    const capabilities = await handlers.get('register-plugin-cluster-provider-capabilities')!(
      event,
      [{ pluginName: 'example', providers: ['example.cluster'] }]
    );

    await expect(
      handlers.get('invoke-cluster-provider')!(event, capabilities.example[0].capability, {
        cluster: 'demo',
      })
    ).resolves.toEqual({ success: false, message: 'Cluster provider failed' });
  });

  it('allows capability registration only once per page load', async () => {
    register('example.cluster');
    const { handlers, event, webContents } = setup();
    const registerCapabilities = handlers.get('register-plugin-cluster-provider-capabilities')!;

    expect(
      await registerCapabilities(event, [{ pluginName: 'example', providers: ['example.cluster'] }])
    ).toHaveProperty('example');
    expect(await registerCapabilities(event, [])).toEqual({});

    const didStartLoading = webContents.on.mock.calls.find(
      ([eventName]) => eventName === 'did-start-loading'
    )![1];
    didStartLoading();
    expect(
      await registerCapabilities(event, [{ pluginName: 'example', providers: ['example.cluster'] }])
    ).toHaveProperty('example');
  });

  it('replaces its own handlers when a window is recreated', () => {
    const { removeHandler } = setup();

    expect(removeHandler).toHaveBeenCalledWith('register-plugin-cluster-provider-capabilities');
    expect(removeHandler).toHaveBeenCalledWith('invoke-cluster-provider');
  });
});
