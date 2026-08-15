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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginManager } from './pluginManager';

describe('PluginManager', () => {
  let handleResponse: (response: string) => void;
  const send = vi.fn();
  const removeListener = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    send.mockReset();
    removeListener.mockReset();
    window.desktopApi = {
      send,
      receive: vi.fn((_channel, listener) => {
        handleResponse = listener;
      }),
      removeListener,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['install', ['operation-1', 'example', 'https://example.com/plugin'], 'INSTALL'],
    ['update', ['operation-1', 'example'], 'UPDATE'],
    ['uninstall', ['operation-1', 'example'], 'UNINSTALL'],
    ['cancel', ['operation-1'], 'CANCEL'],
  ] as const)('sends the %s request', (method, args, action) => {
    PluginManager[method](...(args as any));

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      'plugin-manager',
      expect.stringContaining(`"action":"${action}"`)
    );
  });

  it('returns installed plugins from a list response', async () => {
    const response = PluginManager.list();

    handleResponse(
      JSON.stringify({
        type: 'success',
        message: 'done',
        identifier: 'list-plugins',
        data: { example: { version: '1.0.0' } },
      })
    );

    await expect(response).resolves.toEqual({ example: { version: '1.0.0' } });
  });

  it('rejects an error list response', async () => {
    const response = PluginManager.list();

    handleResponse(
      JSON.stringify({ type: 'error', message: 'list failed', identifier: 'list-plugins' })
    );

    await expect(response).rejects.toThrow('list failed');
  });

  it('removes its listener after receiving the matching response', async () => {
    const response = PluginManager.getStatus('operation-1');

    handleResponse(JSON.stringify({ type: 'success', message: 'done', identifier: 'operation-1' }));

    await expect(response).resolves.toMatchObject({ identifier: 'operation-1' });
    expect(removeListener).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith('plugin-manager', handleResponse);
  });

  it('removes its listener after malformed JSON', async () => {
    const response = PluginManager.getStatus('operation-1');

    handleResponse('{');

    await expect(response).rejects.toBeInstanceOf(SyntaxError);
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('removes its listener after the response limit', async () => {
    const response = PluginManager.getStatus('operation-1');

    for (let index = 0; index < 10; index++) {
      handleResponse(
        JSON.stringify({ type: 'progress', message: 'working', identifier: `other-${index}` })
      );
    }

    await expect(response).rejects.toThrow('Message limit exceeded');
    expect(removeListener).toHaveBeenCalledOnce();
  });

  it('removes its listener after timing out', async () => {
    const response = PluginManager.getStatus('operation-1');
    const rejection = expect(response).rejects.toThrow('Timeout exceeded');

    await vi.advanceTimersByTimeAsync(10000);

    await rejection;
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
