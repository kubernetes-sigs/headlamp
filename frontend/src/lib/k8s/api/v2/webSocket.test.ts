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

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { openWebSocket, useWebSockets } from './webSocket';
import { BASE_WS_URL } from './webSocket';

vi.mock('../../../cluster', () => ({
  getCluster: vi.fn(() => ''),
}));

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(() => ''),
}));

describe('useWebSockets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('openWebSocket protocols', () => {
    afterEach(() => {
      setBackendToken(null);
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it.each([
      {
        name: 'with a backend token',
        token: 'desktop-token',
        backendProtocol: 'base64url.headlamp.backend.authorization.k8s.io.ZGVza3RvcC10b2tlbg',
      },
      { name: 'without a backend token', token: null, backendProtocol: null },
    ])('preserves Kubernetes, caller, and stateless protocols $name', async testCase => {
      const socket = {
        addEventListener: vi.fn(),
        binaryType: '',
      };
      const WebSocketMock = vi.fn(function () {
        return socket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);
      (findKubeconfigByClusterName as Mock).mockResolvedValue({});
      (getUserIdFromLocalStorage as Mock).mockReturnValue('stateless-user');
      setBackendToken(testCase.token);

      await openWebSocket('/api/v1/pods', {
        cluster: 'test-cluster',
        protocols: ['caller.protocol'],
        type: 'binary',
        onMessage: vi.fn(),
      });

      expect(WebSocketMock).toHaveBeenCalledWith(
        expect.stringContaining('/clusters/test-cluster/api/v1/pods'),
        [
          'base64.binary.k8s.io',
          'caller.protocol',
          ...(testCase.backendProtocol ? [testCase.backendProtocol] : []),
          'base64url.headlamp.authorization.k8s.io.stateless-user',
        ]
      );
    });

    it('uses default protocols without a cluster', async () => {
      const listeners: Record<string, EventListener> = {};
      const socket = {
        addEventListener: vi.fn((type: string, listener: EventListener) => {
          listeners[type] = listener;
        }),
        binaryType: '',
      };
      const WebSocketMock = vi.fn(function () {
        return socket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);
      const onMessage = vi.fn();

      await openWebSocket('/api/v1/pods', {
        type: 'binary',
        onMessage,
      });
      listeners.message(new MessageEvent('message', { data: 'binary-data' }));

      expect(WebSocketMock).toHaveBeenCalledWith(expect.not.stringContaining('/clusters/'), [
        'base64.binary.k8s.io',
      ]);
      expect(onMessage).toHaveBeenCalledWith('binary-data');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    WS.clean();
  });

  it('delivers messages to all listeners that share the same websocket connection', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    renderHook(() =>
      useWebSockets({
        connections: [
          { cluster: '', url, onMessage: onMessageA },
          { cluster: '', url, onMessage: onMessageB },
        ],
      })
    );

    await server.connected;
    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-a' } } }));

    await waitFor(() => {
      expect(onMessageA).toHaveBeenCalledTimes(1);
      expect(onMessageB).toHaveBeenCalledTimes(1);
    });
  });

  it('delivers messages to remaining listeners when one listener throws', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=2';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const listenerError = new Error('listener failed');
    const onMessageA = vi.fn(() => {
      throw listenerError;
    });
    const onMessageB = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() =>
      useWebSockets({
        connections: [
          { cluster: '', url, onMessage: onMessageA },
          { cluster: '', url, onMessage: onMessageB },
        ],
      })
    );

    await server.connected;
    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-b' } } }));

    await waitFor(() => {
      expect(onMessageA).toHaveBeenCalledTimes(1);
      expect(onMessageB).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith('WebSocket listener error:', listenerError);
    });
  });

  it('keeps a shared websocket alive until the last listener unsubscribes', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=3';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    const hookA = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageA }],
      })
    );

    await server.connected;

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageB }],
      })
    );

    hookA.unmount();

    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-b' } } }));

    await waitFor(() => {
      expect(onMessageA).not.toHaveBeenCalled();
      expect(onMessageB).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps a pending shared websocket alive when its first listener unsubscribes', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=4';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    const hookA = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageA }],
      })
    );

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessageB }],
      })
    );
    hookA.unmount();

    await server.connected;
    await server.send(JSON.stringify({ type: 'DELETED', object: { metadata: { uid: 'pod-d' } } }));

    await waitFor(() => {
      expect(onMessageA).not.toHaveBeenCalled();
      expect(onMessageB).toHaveBeenCalledTimes(1);
    });
  });
});
