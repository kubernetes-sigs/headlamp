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
import { onSocketStable, reconnectDecision } from './useTerminalStream';

/** A socket whose open event the test fires. */
function fakeSocket(readyState: number) {
  const listeners: Array<() => void> = [];
  const socket = {
    readyState,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === 'open') listeners.push(listener);
    }),
    open() {
      socket.readyState = WebSocket.OPEN;
      listeners.forEach(listener => listener());
    },
  };
  return socket;
}

describe('onSocketStable', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts from when a slow handshake completes', () => {
    const socket = fakeSocket(WebSocket.CONNECTING);
    const onStable = vi.fn();
    onSocketStable(socket as unknown as WebSocket, 1000, onStable);

    vi.advanceTimersByTime(1500);
    expect(onStable).not.toHaveBeenCalled();

    socket.open();
    vi.advanceTimersByTime(999);
    expect(onStable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onStable).toHaveBeenCalledOnce();
  });

  it('counts from now for a socket that is already open', () => {
    const onStable = vi.fn();
    onSocketStable(fakeSocket(WebSocket.OPEN) as unknown as WebSocket, 1000, onStable);

    vi.advanceTimersByTime(1000);
    expect(onStable).toHaveBeenCalledOnce();
  });

  it('does not count a socket that closes before it is stable', () => {
    const socket = fakeSocket(WebSocket.OPEN);
    const onStable = vi.fn();
    onSocketStable(socket as unknown as WebSocket, 1000, onStable);

    socket.readyState = WebSocket.CLOSED;
    vi.advanceTimersByTime(1000);
    expect(onStable).not.toHaveBeenCalled();
  });
});

describe('reconnectDecision', () => {
  it('keeps retrying quietly while the terminal starts, within its own budget', () => {
    // A new shell pod or debug container can take a while to start.
    expect(reconnectDecision(false, 0, 10, 60)).toBe('retry-quietly');
    expect(reconnectDecision(false, 59, 10, 60)).toBe('retry-quietly');
    expect(reconnectDecision(false, 60, 10, 60)).toBe('give-up');
  });

  it('retries a dropped connection within the budget, then gives up', () => {
    expect(reconnectDecision(true, 0, 10, 60)).toBe('retry');
    expect(reconnectDecision(true, 9, 10, 60)).toBe('retry');
    expect(reconnectDecision(true, 10, 10, 60)).toBe('give-up');
  });
});
