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

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import WS from 'vitest-websocket-mock';
import { setBackendToken } from '../../../../helpers/getHeadlampAPIHeaders';
import { findKubeconfigByClusterName } from '../../../../stateless/findKubeconfigByClusterName';
import { getUserIdFromLocalStorage } from '../../../../stateless/getUserIdFromLocalStorage';
import { openWebSocket, resetWebSocketsForTesting, useWebSockets } from './webSocket';
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

function captureLegacySockets() {
  const created: ControlledSocket[] = [];
  class ControlledSocket extends EventTarget {
    static OPEN = 1;
    binaryType = '';
    readyState = 0;
    constructor(public url: string) {
      super();
      created.push(this);
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
    }
    close() {
      this.readyState = 3;
      this.dispatchEvent(new CloseEvent('close', { code: 1006 }));
    }
    message(data: unknown) {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }
  vi.stubGlobal('WebSocket', ControlledSocket);
  return created;
}

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
      { name: 'one cluster', detail: { cluster: 'test-cluster' } },
      { name: 'all clusters', detail: {} },
    ])('reopens a legacy watch after $name reset', async ({ detail }) => {
      const created = captureLegacySockets();
      const onMessage = vi.fn();
      const hook = renderHook(() =>
        useWebSockets({
          connections: [
            {
              cluster: 'test-cluster',
              url: 'api/v1/pods?watch=1',
              onMessage,
            },
          ],
        })
      );
      await act(async () => {});
      expect(created).toHaveLength(1);
      created[0].open();

      act(() => window.dispatchEvent(new CustomEvent('headlamp-credentials-changed', { detail })));
      await waitFor(() => expect(created).toHaveLength(2));
      hook.unmount();
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

  it.each(['cursor', 'generation'])(
    'bounds snapshot recovery across %s changes and resets only after an open',
    async mode => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const created = captureLegacySockets();
      const owner = {};
      const onError = vi.fn();
      const onReady = vi.fn();
      let snapshotVersion = 10;
      const snapshot = vi.fn(async () =>
        mode === 'cursor' ? `api/v1/pods?watch=1&resourceVersion=${++snapshotVersion}` : undefined
      );
      const hook = renderHook(
        ({ cursor, generation }) =>
          useWebSockets({
            connections: [
              {
                cluster: '',
                url: `api/v1/pods?watch=1&resourceVersion=${cursor}`,
                recoveryOwner: owner,
                generation,
                reconnectUrl: () => `api/v1/pods?watch=1&resourceVersion=${cursor}`,
                onMessage: vi.fn(),
                onError,
                onReady,
                onRecoveryNeeded: () => snapshot(),
              },
            ],
          }),
        { initialProps: { cursor: 1, generation: 0 } }
      );
      const failAndTick = async () => {
        await act(async () => {
          created[created.length - 1].close();
          await vi.runOnlyPendingTimersAsync();
        });
      };
      try {
        await act(async () => {});
        let generation = 0;
        for (let step = 0; step < 24; step++) {
          const beforeSockets = created.length;
          const beforeSnapshots = snapshot.mock.calls.length;
          await failAndTick();
          if (mode === 'generation' && snapshot.mock.calls.length > beforeSnapshots) {
            hook.rerender({ cursor: 1, generation: ++generation });
            await act(async () => {});
          }
          if (
            created.length === beforeSockets &&
            snapshot.mock.calls.length === beforeSnapshots &&
            vi.getTimerCount() === 0
          )
            break;
        }
        expect(snapshot).toHaveBeenCalledTimes(3);
        expect(onError).toHaveBeenLastCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('recovery exhausted'),
          })
        );
        expect(onReady).not.toHaveBeenCalled();
        const stoppedAt = created.length;
        await act(async () => {
          vi.advanceTimersByTime(60_000);
        });
        expect(created).toHaveLength(stoppedAt);
        expect(snapshot).toHaveBeenCalledTimes(3);

        hook.rerender({ cursor: 100, generation: ++generation });
        await act(async () => {});
        act(() => created[created.length - 1].open());
        expect(onReady).toHaveBeenCalledOnce();
        for (let step = 0; step < 5 && snapshot.mock.calls.length === 3; step++) {
          await failAndTick();
        }
        expect(snapshot).toHaveBeenCalledTimes(4);
      } finally {
        hook.unmount();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    }
  );

  it('uses independent sockets for different recovery owners with the same watch URL', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const created = captureLegacySockets();
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const firstMessage = vi.fn();
    const secondMessage = vi.fn();
    const recoverFirst = vi.fn(async () => 'api/v1/pods?watch=1&resourceVersion=20');
    const recoverSecond = vi.fn(async () => 'api/v1/pods?watch=1&resourceVersion=30');
    const connections = [
      {
        cluster: '',
        url,
        recoveryOwner: {},
        reconnectUrl: () => url,
        onMessage: firstMessage,
        onRecoveryNeeded: recoverFirst,
      },
      {
        cluster: '',
        url,
        recoveryOwner: {},
        reconnectUrl: () => url,
        onMessage: secondMessage,
        onRecoveryNeeded: recoverSecond,
      },
    ];
    const hook = renderHook(() => useWebSockets({ connections }));
    try {
      await act(async () => {});
      expect(created).toHaveLength(2);
      created[0].open();
      created[1].open();
      created[0].close();
      for (const delay of [1000, 2000, 4000]) {
        await act(async () => {
          vi.advanceTimersByTime(delay);
        });
        created[created.length - 1].close();
      }
      await act(async () => {});
      expect(recoverFirst).toHaveBeenCalledOnce();
      expect(recoverSecond).not.toHaveBeenCalled();
      expect(created[created.length - 1].url).toContain('resourceVersion=20');
      expect(created[1].readyState).toBe(1);
      created[1].message({ type: 'MODIFIED', version: '2' });
      expect(secondMessage).toHaveBeenCalledWith({ type: 'MODIFIED', version: '2' });
      expect(firstMessage).not.toHaveBeenCalled();
    } finally {
      hook.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('keeps another namespace connected while one entry suspends and adopts a fresh snapshot', async () => {
    const created = captureLegacySockets();
    const healthyMessage = vi.fn();
    const refreshedMessage = vi.fn();
    const first = {
      cluster: '',
      url: 'api/v1/namespaces/first/pods?watch=1&resourceVersion=1',
      recoveryOwner: {},
      generation: 0,
      reconnectUrl: () => 'api/v1/namespaces/first/pods?watch=1&resourceVersion=20',
      onMessage: vi.fn(),
    };
    const healthy = {
      cluster: '',
      url: 'api/v1/namespaces/second/pods?watch=1&resourceVersion=1',
      recoveryOwner: {},
      generation: 0,
      reconnectUrl: () => 'api/v1/namespaces/second/pods?watch=1&resourceVersion=12',
      onMessage: healthyMessage,
    };
    const hook = renderHook(({ connections }) => useWebSockets({ connections }), {
      initialProps: { connections: [first, healthy] },
    });
    try {
      await act(async () => {});
      created[0].open();
      created[1].open();
      created[1].message({ type: 'MODIFIED', version: '12' });
      hook.rerender({ connections: [{ ...healthy, onMessage: refreshedMessage }] });
      await act(async () => {});
      expect(created).toHaveLength(2);
      expect(created[0].readyState).toBe(3);
      expect(created[1].readyState).toBe(1);
      created[1].message({ type: 'MODIFIED', version: '13' });
      expect(healthyMessage).toHaveBeenCalledOnce();
      expect(refreshedMessage).toHaveBeenCalledExactlyOnceWith({ type: 'MODIFIED', version: '13' });
      hook.rerender({
        connections: [
          { ...first, generation: 1, url: first.reconnectUrl() },
          { ...healthy, onMessage: refreshedMessage },
        ],
      });
      await act(async () => {});
      expect(created).toHaveLength(3);
      expect(created[1].readyState).toBe(1);
      expect(created[2].url).toContain('resourceVersion=20');
    } finally {
      hook.unmount();
      vi.unstubAllGlobals();
    }
  });

  it('does not join a retired generation while a shared owner is recovering', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const created = captureLegacySockets();
    const owner = {};
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const firstMessage = vi.fn();
    const secondMessage = vi.fn();
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    let finishRecovery!: () => void;
    const recover = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishRecovery = resolve;
        })
    );
    const first = renderHook(
      ({ generation }) =>
        useWebSockets({
          connections: [
            {
              cluster: '',
              url,
              recoveryOwner: owner,
              generation,
              reconnectUrl: () => url,
              onMessage: firstMessage,
              onReady: firstReady,
              onRecoveryNeeded: recover,
            },
          ],
        }),
      { initialProps: { generation: 0 } }
    );
    const second = renderHook(
      ({ generation }) =>
        useWebSockets({
          connections: [
            {
              cluster: '',
              url,
              recoveryOwner: owner,
              generation,
              reconnectUrl: () => url,
              onMessage: secondMessage,
              onReady: secondReady,
              onRecoveryNeeded: recover,
            },
          ],
        }),
      { initialProps: { generation: 0 } }
    );
    try {
      await act(async () => {});
      expect(created).toHaveLength(1);
      created[0].close();
      for (const delay of [1000, 2000, 4000]) {
        await act(async () => {
          vi.advanceTimersByTime(delay);
        });
        created[created.length - 1].close();
      }
      await act(async () => {});
      expect(recover).toHaveBeenCalledOnce();
      first.rerender({ generation: 1 });
      second.rerender({ generation: 1 });
      await act(async () => {});
      expect(created).toHaveLength(5);
      await act(async () => {
        finishRecovery();
      });
      created[4].open();
      created[4].message({ type: 'MODIFIED', version: '2' });
      expect(firstReady).toHaveBeenCalledOnce();
      expect(secondReady).toHaveBeenCalledOnce();
      expect(firstMessage).toHaveBeenCalledWith({ type: 'MODIFIED', version: '2' });
      expect(secondMessage).toHaveBeenCalledWith({ type: 'MODIFIED', version: '2' });
    } finally {
      first.unmount();
      second.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('notifies remaining observers of one owner after the original observer unmounts', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const created = captureLegacySockets();
    const url = 'api/v1/pods?watch=1&resourceVersion=1';
    const owner = {};
    const firstReady = vi.fn();
    const secondReady = vi.fn();
    const firstError = vi.fn();
    const secondError = vi.fn();
    const firstConnections = [
      {
        cluster: '',
        url,
        recoveryOwner: owner,
        reconnectUrl: () => url,
        onMessage: vi.fn(),
        onReady: firstReady,
        onError: firstError,
      },
    ];
    const secondConnections = [
      {
        cluster: '',
        url,
        recoveryOwner: owner,
        reconnectUrl: () => url,
        onMessage: vi.fn(),
        onReady: secondReady,
        onError: secondError,
      },
    ];
    const first = renderHook(() => useWebSockets({ connections: firstConnections }));
    const second = renderHook(() => useWebSockets({ connections: secondConnections }));
    try {
      await act(async () => {});
      expect(created).toHaveLength(1);
      created[0].open();
      expect(firstReady).toHaveBeenCalledOnce();
      expect(secondReady).toHaveBeenCalledOnce();
      first.unmount();
      created[0].close();
      for (const delay of [1000, 2000, 4000]) {
        await act(async () => {
          vi.advanceTimersByTime(delay);
        });
        created[created.length - 1].close();
      }
      expect(firstError).not.toHaveBeenCalled();
      expect(secondError).toHaveBeenCalledOnce();
    } finally {
      first.unmount();
      second.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
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

  it('retries a failed legacy handshake at its latest cursor and keeps the listener', async () => {
    const watchUrl = 'api/v1/pods?watch=1&resourceVersion=20';
    const nextUrl = 'api/v1/pods?watch=1&resourceVersion=21';
    const opening = new WS(`${BASE_WS_URL}${watchUrl}`);
    const onMessage = vi.fn();
    const reconnectUrl = vi.fn(() => nextUrl);
    const onReady = vi.fn();
    const onError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url: watchUrl, onMessage, reconnectUrl, onReady, onError }],
      })
    );

    await opening.connected;
    opening.send(JSON.stringify({ type: 'MODIFIED', version: '21' }));
    expect(onMessage).toHaveBeenCalledWith({ type: 'MODIFIED', version: '21' });
    expect(reconnectUrl).not.toHaveBeenCalled();

    opening.close();
    await waitFor(() => expect(consoleError).toHaveBeenCalled(), { timeout: 2200 });
    expect(reconnectUrl).toHaveBeenCalledOnce();
    const resumed = new WS(`${BASE_WS_URL}${nextUrl}`);
    await resumed.connected;
    expect(reconnectUrl).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    resumed.send(JSON.stringify({ type: 'DELETED', version: '22' }));
    expect(onMessage).toHaveBeenLastCalledWith({ type: 'DELETED', version: '22' });
  });

  it.each(['success', 'failure', 'unmount'])(
    'obtains a fresh snapshot after opaque handshake failures before reopening (%s)',
    async outcome => {
      vi.useFakeTimers();
      const created: MockSocket[] = [];
      class MockSocket extends EventTarget {
        binaryType = '';
        readyState = 0;
        constructor(public url: string) {
          super();
          created.push(this);
        }
        close() {
          this.readyState = 3;
          this.dispatchEvent(new CloseEvent('close', { code: 1006 }));
        }
      }
      vi.stubGlobal('WebSocket', MockSocket);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let finishSnapshot!: (url: string) => void;
      let failSnapshot!: (error: Error) => void;
      const onRecoveryNeeded = vi.fn(
        () =>
          new Promise<string>((resolve, reject) => {
            finishSnapshot = resolve;
            failSnapshot = reject;
          })
      );
      const onMessage = vi.fn();
      const onError = vi.fn();
      const onReady = vi.fn();
      const connections = [
        {
          cluster: '',
          url: 'api/v1/pods?watch=1&resourceVersion=1',
          reconnectUrl: () => 'api/v1/pods?watch=1&resourceVersion=2',
          onMessage,
          onError,
          onReady,
          onRecoveryNeeded,
        },
      ];
      const hook = renderHook(() => useWebSockets({ connections }));
      try {
        await act(async () => {});
        created[0].readyState = 1;
        created[0].dispatchEvent(new Event('open'));
        created[0].close();
        for (const delay of [1000, 2000, 4000]) {
          await act(async () => {
            vi.advanceTimersByTime(delay);
          });
          created[created.length - 1].close();
        }
        await act(async () => {});
        expect(onRecoveryNeeded).toHaveBeenCalledOnce();
        expect(created).toHaveLength(4);
        await act(async () => {
          vi.advanceTimersByTime(60_000);
        });
        expect(created).toHaveLength(4);
        if (outcome === 'unmount') hook.unmount();
        const forbidden = new Error('Recovery LIST is forbidden');
        await act(async () => {
          if (outcome === 'failure') failSnapshot(forbidden);
          else finishSnapshot('api/v1/pods?watch=1&resourceVersion=20');
        });
        if (outcome === 'success') {
          expect(created).toHaveLength(5);
          expect(created[4].url).toContain('resourceVersion=20');
          created[4].readyState = 1;
          created[4].dispatchEvent(new Event('open'));
          expect(onReady).toHaveBeenCalledTimes(2);
          created[4].dispatchEvent(
            new MessageEvent('message', {
              data: JSON.stringify({ type: 'MODIFIED', version: '21' }),
            })
          );
          expect(onMessage).toHaveBeenCalledWith({ type: 'MODIFIED', version: '21' });
        } else {
          expect(created).toHaveLength(4);
          if (outcome === 'failure') expect(onError).toHaveBeenLastCalledWith(forbidden);
        }
      } finally {
        hook.unmount();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    }
  );

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

  it('does not tear down healthy sockets when connections array reference changes with unchanged connection', async () => {
    const urlA = 'api/v1/namespaces/ns-a/pods?watch=1&resourceVersion=stable-a';
    const urlB = 'api/v1/namespaces/ns-b/pods?watch=1&resourceVersion=stable-b';
    const serverA = new WS(`${BASE_WS_URL}${urlA}`);
    const serverB = new WS(`${BASE_WS_URL}${urlB}`);
    const onMessageA = vi.fn();
    const onMessageB = vi.fn();

    const { rerender } = renderHook(
      ({ conns }) =>
        useWebSockets({
          connections: conns,
        }),
      {
        initialProps: {
          conns: [
            { cluster: '', url: urlA, onMessage: onMessageA },
            { cluster: '', url: urlB, onMessage: onMessageB },
          ],
        },
      }
    );

    await serverA.connected;
    await serverB.connected;

    // Sibling urlA changes to urlA2 (reconnecting), while urlB remains identical
    serverA.close();
    const urlA2 = 'api/v1/namespaces/ns-a2/pods?watch=1&resourceVersion=reconnected-a';
    const serverA2 = new WS(`${BASE_WS_URL}${urlA2}`);

    rerender({
      conns: [
        { cluster: '', url: urlA2, onMessage: onMessageA },
        { cluster: '', url: urlB, onMessage: onMessageB },
      ],
    });

    await serverA2.connected;

    // serverB must NOT have closed and should continue receiving messages
    await serverB.send(JSON.stringify({ type: 'ADDED', object: { metadata: { name: 'pod-b' } } }));
    await waitFor(() => {
      expect(onMessageB).toHaveBeenCalledWith({
        type: 'ADDED',
        object: { metadata: { name: 'pod-b' } },
      });
    });

    serverA2.close();
    serverB.close();
  });

  it('does not reuse a pooled socket after its type or protocols change', async () => {
    const createdSockets: any[] = [];
    const WebSocketMock = vi.fn(function () {
      const socket = {
        addEventListener: vi.fn(),
        binaryType: '',
        close: vi.fn(),
        readyState: 1,
      };
      createdSockets.push(socket);
      return socket;
    });
    vi.stubGlobal('WebSocket', WebSocketMock);

    const url = 'api/v1/pods?watch=1&resourceVersion=options';
    const onMessage = vi.fn();
    const hook = renderHook(
      ({ type, protocols }: { type: 'json' | 'binary'; protocols: string[] }) =>
        useWebSockets({
          connections: [{ cluster: '', url, onMessage }],
          type,
          protocols,
        }),
      {
        initialProps: { type: 'json', protocols: ['caller.protocol'] } as {
          type: 'json' | 'binary';
          protocols: string[];
        },
      }
    );

    await waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));
    hook.rerender({ type: 'json', protocols: ['caller.protocol'] });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(WebSocketMock).toHaveBeenCalledTimes(1);

    hook.rerender({ type: 'binary', protocols: ['caller.protocol'] });
    await waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(createdSockets[0].close).toHaveBeenCalled());

    hook.rerender({ type: 'binary', protocols: ['different.protocol'] });
    await waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(createdSockets[1].close).toHaveBeenCalled());

    hook.unmount();
  });

  it('notifies onClose listeners and removes socket when connection closes', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=5';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessage = vi.fn();
    const onClose = vi.fn();

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage, onClose }],
      })
    );

    await server.connected;

    // Simulate unexpected server close
    server.close();

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onClose when unmounting intentionally', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=6';
    const server = new WS(`${BASE_WS_URL}${url}`);
    const onMessage = vi.fn();
    const onClose = vi.fn();

    const hook = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage, onClose }],
      })
    );

    await server.connected;

    // Unmount intentionally
    hook.unmount();

    // Allow any asynchronous close events to settle
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleans up pending socket reference if it closes during initialization', async () => {
    const url = 'api/v1/pods?watch=1&resourceVersion=7';
    const server1 = new WS(`${BASE_WS_URL}${url}`);
    const onMessage1 = vi.fn();
    const onClose1 = vi.fn();

    const hook1 = renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessage1, onClose: onClose1 }],
      })
    );

    await server1.connected;
    // Server closes connection immediately
    server1.close();

    await waitFor(() => {
      expect(onClose1).toHaveBeenCalledTimes(1);
    });

    hook1.unmount();

    // Now establish a second connection to the same URL with a fresh server
    const server2 = new WS(`${BASE_WS_URL}${url}`);
    const onMessage2 = vi.fn();

    renderHook(() =>
      useWebSockets({
        connections: [{ cluster: '', url, onMessage: onMessage2 }],
      })
    );

    // The second connection must successfully connect and receive messages
    await server2.connected;
    await server2.send(
      JSON.stringify({ type: 'ADDED', object: { metadata: { name: 'pod-fresh' } } })
    );

    await waitFor(() => {
      expect(onMessage2).toHaveBeenCalledTimes(1);
    });

    server2.close();
  });

  describe('handshake failure and retry behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      resetWebSocketsForTesting();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('schedules a 5-second delayed retry on immediate close without spinning immediately', async () => {
      const createdSockets: any[] = [];

      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const onMessage = vi.fn();
      const onClose = vi.fn();
      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage, onClose }],
        })
      );

      // Sockets connect asynchronously through openWebSocket
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // Simulate handshake failure: close fires without open event
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // Verify onClose is NOT called when !hasOpened
      expect(onClose).not.toHaveBeenCalled();

      // Ensure no immediate retry spin
      vi.advanceTimersByTime(1000);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(3999);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      // At 5 seconds, single-flight retry fires
      vi.advanceTimersByTime(1);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

      hook.unmount();
    });

    it('notifies close listeners after repeated handshake failures', async () => {
      const createdSockets: any[] = [];
      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const onClose = vi.fn();
      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage: vi.fn(), onClose }],
        })
      );

      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // First handshake failure
      createdSockets[0].listenersMap.close(new CloseEvent('close'));
      expect(onClose).not.toHaveBeenCalled();

      // Retry 1
      vi.advanceTimersByTime(5000);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

      // Second handshake failure
      createdSockets[1].listenersMap.close(new CloseEvent('close'));
      expect(onClose).not.toHaveBeenCalled();

      // Retry 2
      vi.advanceTimersByTime(5000);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(3));

      // Third handshake failure
      createdSockets[2].listenersMap.close(new CloseEvent('close'));

      // Close listeners must be notified so recovery/relist can occur
      expect(onClose).toHaveBeenCalledTimes(1);

      hook.unmount();
    });

    it('continues retrying when no close listener exists after repeated handshake failures', async () => {
      const createdSockets: any[] = [];
      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage: vi.fn() }],
        })
      );

      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // First handshake failure
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // Retry 1 (5s)
      vi.advanceTimersByTime(5000);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

      // Second handshake failure
      createdSockets[1].listenersMap.close(new CloseEvent('close'));

      // Retry 2 (5s)
      vi.advanceTimersByTime(5000);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(3));

      // Third handshake failure
      createdSockets[2].listenersMap.close(new CloseEvent('close'));

      // Since there is no close listener, a retry timer must still be scheduled
      vi.advanceTimersByTime(5000);
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(4));

      hook.unmount();
    });

    it('wakes up failed endpoint immediately when browser online event fires', async () => {
      const createdSockets: any[] = [];
      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage: vi.fn() }],
        })
      );

      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // Simulate failed handshake
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // 1 second elapsed, no retry yet
      vi.advanceTimersByTime(1000);
      expect(WebSocketMock).toHaveBeenCalledTimes(1);

      // Browser online event triggers immediate retry
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

      // Advancing remaining timer does not trigger duplicate retry
      vi.advanceTimersByTime(5000);
      expect(WebSocketMock).toHaveBeenCalledTimes(2);

      hook.unmount();
    });

    it('clears retry timers when component unmounts', async () => {
      const createdSockets: any[] = [];
      const WebSocketMock = vi.fn(function () {
        const listenersMap: Record<string, Function> = {};
        const mockSocket = {
          binaryType: '',
          readyState: 0,
          addEventListener: vi.fn((event: string, handler: Function) => {
            listenersMap[event] = handler;
          }),
          close: vi.fn(),
          listenersMap,
        };
        createdSockets.push(mockSocket);
        return mockSocket;
      });
      vi.stubGlobal('WebSocket', WebSocketMock);

      const hook = renderHook(() =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage: vi.fn() }],
        })
      );

      await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));

      // Simulate failed handshake
      createdSockets[0].listenersMap.close(new CloseEvent('close'));

      // Unmount component before 5s retry timer fires
      hook.unmount();

      // Advance time past the 5s timer window
      vi.advanceTimersByTime(10000);

      // No new connection attempt should occur
      expect(WebSocketMock).toHaveBeenCalledTimes(1);
    });
  });

  it('replaces socket instead of reusing when type or protocols change', async () => {
    const createdSockets: any[] = [];
    const WebSocketMock = vi.fn(function (_url: string, protocols: string[]) {
      const listenersMap: Record<string, Function> = {};
      const mockSocket = {
        binaryType: '',
        readyState: 1,
        protocols,
        addEventListener: vi.fn((event: string, handler: Function) => {
          listenersMap[event] = handler;
        }),
        close: vi.fn(),
        listenersMap,
      };
      createdSockets.push(mockSocket);
      return mockSocket;
    });
    vi.stubGlobal('WebSocket', WebSocketMock);

    const onMessage = vi.fn();
    const { rerender } = renderHook(
      ({ type, protocols }: { type: 'json' | 'binary'; protocols?: string | string[] }) =>
        useWebSockets({
          connections: [{ cluster: '', url: '/api/v1/pods', onMessage }],
          type,
          protocols,
        }),
      {
        initialProps: {
          type: 'json' as 'json' | 'binary',
          protocols: undefined as string[] | undefined,
        },
      }
    );

    await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(1));
    createdSockets[0].listenersMap.open?.();
    createdSockets[0].listenersMap.message?.({ data: '{"ok":true}' });
    expect(onMessage).toHaveBeenCalledWith({ ok: true });

    // Switching decoder type from json to binary must open a new socket, not reuse the json decoder
    rerender({ type: 'binary', protocols: undefined });
    await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(2));

    const binaryPayload = new ArrayBuffer(4);
    createdSockets[1].listenersMap.open?.();
    createdSockets[1].listenersMap.message?.({ data: binaryPayload });
    expect(onMessage).toHaveBeenLastCalledWith(binaryPayload);

    // Changing protocols must open a new socket with the updated protocols
    rerender({ type: 'binary', protocols: ['custom.proto'] });
    await vi.waitFor(() => expect(WebSocketMock).toHaveBeenCalledTimes(3));
    expect(WebSocketMock.mock.calls[2][1]).toContain('custom.proto');
  });
});
