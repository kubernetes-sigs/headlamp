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

import { cleanup, renderHook } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// openWebSocket() awaits findKubeconfigByClusterName() before it settles, so
// mocking this dependency lets us control exactly when each connection
// attempt's promise resolves - which is what we need to reproduce a race
// between a stale (pre-unmount) attempt and a fresh (post-remount) one.
const findKubeconfigByClusterNameMock = vi.fn();
vi.mock('../../../../stateless/findKubeconfigByClusterName', () => ({
  findKubeconfigByClusterName: (...args: any[]) => findKubeconfigByClusterNameMock(...args),
}));

vi.mock('../../../../stateless/getUserIdFromLocalStorage', () => ({
  getUserIdFromLocalStorage: () => 'test-user',
}));

// Minimal fake WebSocket so we don't attempt real network connections and so
// we can inspect close() calls on the instances that get created.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  binaryType = '';
  close = vi.fn();
  addEventListener = vi.fn();
  constructor(public url: string, public protocols: string[]) {
    FakeWebSocket.instances.push(this);
  }
}

vi.stubGlobal('WebSocket', FakeWebSocket);
afterAll(() => {
  vi.unstubAllGlobals();
});

const { useWebSockets } = await import('./webSocket');

describe('useWebSockets - stale connection race condition', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    FakeWebSocket.instances = [];
  });

  it('does not let a stale connection attempt drop a newer live connection', async () => {
    // First call (triggered by the first mount) resolves *after* the second
    // call (triggered by the remount) - simulating a slow connection attempt
    // that only completes once a newer one has already taken over.
    let resolveStale!: (v: null) => void;
    let resolveFresh!: (v: null) => void;

    findKubeconfigByClusterNameMock
      .mockImplementationOnce(() => new Promise(resolve => (resolveStale = resolve)))
      .mockImplementationOnce(() => new Promise(resolve => (resolveFresh = resolve)));

    const connection = {
      cluster: 'test-cluster',
      url: '/api/v1/pods?watch=1',
      onMessage: vi.fn(),
    };

    // First mount kicks off the "stale" connection attempt.
    const { unmount } = renderHook(() =>
      useWebSockets({ connections: [connection], enabled: true })
    );

    // Unmount before that attempt resolves (e.g. StrictMode double-invoke,
    // or fast navigation away from a view using this watch).
    unmount();

    // Remount immediately: kicks off the "fresh" connection attempt for the
    // same connectionKey (same cluster + url).
    renderHook(() => useWebSockets({ connections: [connection], enabled: true }));

    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    // Let the fresh (remounted) attempt finish first.
    resolveFresh!(null);
    await flush();

    // Now let the stale (pre-unmount) attempt finally resolve. The bug this
    // guards against: the stale attempt's stored connection map entry gets
    // silently deleted/overwritten, orphaning the live fresh socket even
    // though it's never actually closed.
    resolveStale!(null);
    await flush();

    expect(FakeWebSocket.instances).toHaveLength(2);

    // A third mount for the *same* connection should reuse the still-live
    // fresh connection rather than opening a brand new one. If the stale
    // attempt's resolution corrupted the connection tracking (the bug),
    // useWebSockets loses track of the fresh socket and opens a redundant
    // third connection here - a real, compounding connection leak every
    // time this race occurs.
    findKubeconfigByClusterNameMock.mockImplementationOnce(() => Promise.resolve(null));
    renderHook(() => useWebSockets({ connections: [connection], enabled: true }));
    await flush();

    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
