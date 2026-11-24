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

import { afterEach, describe, expect, it, Mock, vi } from 'vitest';
import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { connectStreamWithParams } from './streamingApi';

vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: vi.fn(),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: vi.fn(),
}));

vi.mock('../../../../helpers/debugVerbose', () => ({
  isDebugVerbose: vi.fn(() => false),
}));

describe('connectStreamWithParams protocols', () => {
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

    await connectStreamWithParams('/api/v1/pods', vi.fn(), vi.fn(), {
      cluster: 'test-cluster',
      additionalProtocols: ['caller.protocol'],
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

  it('uses default protocols and parses JSON messages', async () => {
    const listeners: Record<string, EventListener> = {};
    const socket = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners[type] = listener;
      }),
      binaryType: '',
      close: vi.fn(),
    };
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        return socket;
      })
    );
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
    const onMessage = vi.fn();

    await connectStreamWithParams('/api/v1/pods', onMessage, vi.fn(), {
      cluster: 'test-cluster',
      isJson: true,
    });
    listeners.message(new MessageEvent('message', { data: JSON.stringify({ kind: 'Pod' }) }));

    expect(onMessage).toHaveBeenCalledWith({ kind: 'Pod' });
  });

  it('returns a closable connection when socket construction fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        throw new Error('socket construction failed');
      })
    );
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);

    const connection = await connectStreamWithParams('/api/v1/pods', vi.fn(), vi.fn(), {
      cluster: 'test-cluster',
    });

    expect(connection.socket).toBeNull();
    expect(connection.close).not.toThrow();
  });

  it('delivers binary messages through the default parser', async () => {
    const listeners: Record<string, EventListener> = {};
    vi.mocked(isDebugVerbose).mockReturnValue(true);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        return {
          addEventListener: vi.fn((type: string, listener: EventListener) => {
            listeners[type] = listener;
          }),
          binaryType: '',
        };
      })
    );
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
    const onMessage = vi.fn();

    await connectStreamWithParams('/api/v1/pods', onMessage, vi.fn(), {
      cluster: 'test-cluster',
    });
    listeners.message(new MessageEvent('message', { data: 'binary-data' }));

    expect(onMessage).toHaveBeenCalledWith('binary-data');
  });
});
