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

import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { clusterRequest } from './clusterRequests';
import {
  connectStreamWithParams,
  stream,
  streamResult,
  streamResults,
  streamResultsForCluster,
} from './streamingApi';

vi.mock('./clusterRequests', () => ({
  clusterRequest: vi.fn(),
}));

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

describe('cancelling a stream from its first callback', () => {
  beforeEach(() => {
    vi.mocked(isDebugVerbose).mockReturnValue(false);
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Makes the initial request wait until the returned function is called with its response. */
  function deferClusterRequest() {
    let respond: (response: unknown) => void = () => {};
    vi.mocked(clusterRequest).mockReturnValue(
      new Promise(resolve => {
        respond = resolve;
      })
    );
    return (response: unknown) => respond(response);
  }

  function stubWebSocket() {
    const WebSocketMock = vi.fn(function () {
      return { addEventListener: vi.fn(), binaryType: '', close: vi.fn() };
    });
    vi.stubGlobal('WebSocket', WebSocketMock);
    return WebSocketMock;
  }

  /** Lets the stream finish its pending work, such as opening the watch socket. */
  function settle() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  it('does not open a watch when the list callback cancels the stream', async () => {
    const WebSocketMock = stubWebSocket();
    const respond = deferClusterRequest();
    // Like Deployment.getOwnedReplicaSets(): read the list once, then cancel.
    let cancel: (() => void) | undefined;
    const cb = vi.fn(() => cancel?.());

    await streamResultsForCluster('/apis/apps/v1/namespaces/default/replicasets', {
      cb,
      errCb: vi.fn(),
      cluster: 'test-cluster',
    }).then(cancelStream => {
      cancel = cancelStream;
    });
    respond({
      kind: 'ReplicaSetList',
      items: [{ metadata: { uid: 'rs-1', name: 'rs-1', resourceVersion: '1' } }],
      metadata: { resourceVersion: '1' },
    });
    await settle();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(WebSocketMock).not.toHaveBeenCalled();
  });

  it('does not open a watch when the item callback cancels the stream', async () => {
    const WebSocketMock = stubWebSocket();
    const respond = deferClusterRequest();
    let cancel: (() => void) | undefined;
    const cb = vi.fn(() => cancel?.());

    await streamResult(
      '/api/v1/namespaces/default/pods',
      'my-pod',
      cb,
      vi.fn(),
      undefined,
      'test-cluster'
    ).then(cancelStream => {
      cancel = cancelStream;
    });
    respond({ metadata: { uid: 'pod-1', name: 'my-pod', resourceVersion: '1' } });
    await settle();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(WebSocketMock).not.toHaveBeenCalled();
  });

  it('still opens the watch when the stream is not cancelled', async () => {
    const WebSocketMock = stubWebSocket();
    const respond = deferClusterRequest();
    const cb = vi.fn();

    const cancel = await streamResultsForCluster('/apis/apps/v1/namespaces/default/replicasets', {
      cb,
      errCb: vi.fn(),
      cluster: 'test-cluster',
    });
    respond({ kind: 'ReplicaSetList', items: [], metadata: { resourceVersion: '1' } });
    await settle();

    expect(WebSocketMock).toHaveBeenCalledTimes(1);
    cancel();
  });
});

describe('streamResults, watch updates, limits, errors, and reconnection', () => {
  beforeEach(() => {
    vi.mocked(isDebugVerbose).mockReturnValue(false);
    (findKubeconfigByClusterName as Mock).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubSocketWithListeners() {
    const listeners: Record<string, EventListener> = {};
    const sockets: Array<{
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      binaryType: string;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      'WebSocket',
      vi.fn(function () {
        const socket = {
          addEventListener: vi.fn((type: string, listener: EventListener) => {
            listeners[type] = listener;
          }),
          removeEventListener: vi.fn(),
          binaryType: '',
          close: vi.fn(),
        };
        sockets.push(socket);
        return socket;
      })
    );
    return { listeners, sockets };
  }

  it('handles ADDED, MODIFIED, DELETED, ERROR, unknown updates, and limit in streamResults', async () => {
    const { listeners } = stubSocketWithListeners();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(clusterRequest).mockResolvedValueOnce({
      kind: 'PodList',
      items: [
        {
          metadata: {
            uid: 'u1',
            name: 'p1',
            resourceVersion: '2',
            creationTimestamp: '2025-01-01T00:00:00Z',
          },
        },
        {
          metadata: {
            uid: 'u2',
            name: 'p2',
            resourceVersion: '2',
            creationTimestamp: '2025-01-03T00:00:00Z',
          },
        },
      ],
      metadata: { resourceVersion: '2' },
    });

    const cb = vi.fn();
    const cancel = await streamResults('/api/v1/pods', cb, vi.fn(), { limit: '2' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(cb).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'Pod', metadata: expect.objectContaining({ uid: 'u1' }) }),
      ])
    );

    const sendUpdate = (payload: unknown) =>
      listeners.message(new MessageEvent('message', { data: JSON.stringify(payload) }));

    // ADDED new item triggers limit=2 truncation (keeps newest 2)
    sendUpdate({
      type: 'ADDED',
      object: {
        metadata: {
          uid: 'u3',
          name: 'p3',
          resourceVersion: '3',
          creationTimestamp: '2025-01-02T00:00:00Z',
        },
      },
    });
    const afterAdd = cb.mock.calls.at(-1)?.[0];
    expect(afterAdd).toHaveLength(2);
    expect(afterAdd.map((x: any) => x.metadata.uid)).toEqual(['u2', 'u3']);

    // MODIFIED with newer resourceVersion updates existing
    sendUpdate({
      type: 'MODIFIED',
      object: { metadata: { uid: 'u2', name: 'p2-updated', resourceVersion: '5' } },
    });
    expect(cb.mock.calls.at(-1)?.[0].find((x: any) => x.metadata.uid === 'u2').metadata.name).toBe(
      'p2-updated'
    );

    // MODIFIED with same resourceVersion is ignored
    sendUpdate({
      type: 'MODIFIED',
      object: { metadata: { uid: 'u2', name: 'p2-same-rv', resourceVersion: '5' } },
    });
    expect(cb.mock.calls.at(-1)?.[0].find((x: any) => x.metadata.uid === 'u2').metadata.name).toBe(
      'p2-updated'
    );

    // MODIFIED missing resourceVersion applies update
    sendUpdate({ type: 'MODIFIED', object: { metadata: { uid: 'u2', name: 'p2-no-rv' } } });
    expect(cb.mock.calls.at(-1)?.[0].find((x: any) => x.metadata.uid === 'u2').metadata.name).toBe(
      'p2-no-rv'
    );

    // MODIFIED for unknown uid inserts it
    sendUpdate({
      type: 'MODIFIED',
      object: {
        metadata: {
          uid: 'u4',
          name: 'p4',
          resourceVersion: '6',
          creationTimestamp: '2025-01-04T00:00:00Z',
        },
      },
    });

    // DELETED removes item
    sendUpdate({ type: 'DELETED', object: { metadata: { uid: 'u4' } } });
    expect(cb.mock.calls.at(-1)?.[0].some((x: any) => x.metadata.uid === 'u4')).toBe(false);

    // ERROR and unknown update types log errors without throwing
    sendUpdate({ type: 'ERROR', object: { message: 'watch error' } });
    sendUpdate({ type: 'BOOKMARK', object: {} });

    cancel();
  });

  it('invokes errCb when initial clusterRequest fails in streamResult and streamResultsForCluster', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    vi.mocked(clusterRequest).mockRejectedValueOnce(err).mockRejectedValueOnce(err);

    const errCb1 = vi.fn();
    await streamResult('/api/v1/pods', 'p1', vi.fn(), errCb1, undefined, 'c1');
    const errCb2 = vi.fn();
    await streamResultsForCluster('/api/v1/pods', { cb: vi.fn(), errCb: errCb2, cluster: 'c1' });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(errCb1).toHaveBeenCalledWith(err, expect.any(Function));
    expect(errCb2).toHaveBeenCalledWith(err, expect.any(Function));
  });

  it('handles close, error, kubeconfig lookup failure, and reconnect in stream()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    (findKubeconfigByClusterName as Mock).mockRejectedValue(new Error('kubeconfig err'));

    const { listeners, sockets } = stubSocketWithListeners();
    const connectCb = vi.fn();
    const failCb = vi.fn();

    const handle = stream('/api/v1/pods', vi.fn(), {
      cluster: 'c1',
      connectCb,
      failCb,
      reconnectOnFailure: true,
    });
    expect(handle.getSocket()).toBeNull();

    // Let connectStreamWithParams resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(connectCb).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    const initialSocket = sockets[0];
    expect(handle.getSocket()).toBe(initialSocket);

    listeners.error(new Event('error'));
    vi.useFakeTimers();
    listeners.close(new CloseEvent('close'));

    expect(initialSocket.removeEventListener).toHaveBeenCalled();
    expect(failCb).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(connectCb).toHaveBeenCalledTimes(2);
    expect(sockets).toHaveLength(2);
    const replacementSocket = sockets[1];
    expect(replacementSocket).not.toBe(initialSocket);
    expect(handle.getSocket()).toBe(replacementSocket);

    handle.cancel();
    expect(replacementSocket.close).toHaveBeenCalled();
    expect(initialSocket.close).not.toHaveBeenCalled();
  });
});
