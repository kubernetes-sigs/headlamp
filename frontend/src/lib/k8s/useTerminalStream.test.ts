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

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isRetryableStartError,
  onSocketStable,
  reconnectDecision,
  TerminalStreamOptions,
  useTerminalStream,
} from './useTerminalStream';

const { writeln } = vi.hoisted(() => ({ writeln: vi.fn() }));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options = {};
    cols = 80;
    rows = 24;
    writeln = writeln;
    write = vi.fn();
    clear = vi.fn();
    open = vi.fn();
    focus = vi.fn();
    onData = vi.fn();
    onResize = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    loadAddon = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

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

describe('isRetryableStartError', () => {
  it('only retries a request that could not be sent or was throttled', () => {
    expect(isRetryableStartError({ status: 502 })).toBe(true);
    expect(isRetryableStartError({ status: 429 })).toBe(true);
    // Only failures that are clearly transient are retried.
    expect(isRetryableStartError({ status: 408 })).toBe(false);
    expect(isRetryableStartError({ status: 504 })).toBe(false);
    expect(isRetryableStartError({ status: 403 })).toBe(false);
    expect(isRetryableStartError(new Error('not a request error'))).toBe(false);
  });
});

describe('useTerminalStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeln.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  function startTerminal(connectStream: TerminalStreamOptions['connectStream']) {
    const onClose = vi.fn();
    const onConnectionFailed = vi.fn();
    const { unmount } = renderHook(() =>
      useTerminalStream({
        connectStream,
        containerRef: document.createElement('div'),
        onClose,
        errorHandlers: { onConnectionFailed },
      })
    );
    return { onClose, onConnectionFailed, unmount };
  }

  it('keeps the session when its callbacks change on a rerender', async () => {
    const containerRef = document.createElement('div');
    const cancel = vi.fn();
    const stream = { cancel, getSocket: () => null };
    const first = vi.fn().mockResolvedValue({ stream });
    const { rerender, unmount } = renderHook(
      ({ connectStream }) =>
        useTerminalStream({
          connectStream,
          containerRef,
          onClose: () => {},
          errorHandlers: { isSuccessfulExit: () => false },
        }),
      { initialProps: { connectStream: first } }
    );
    await act(() => vi.advanceTimersByTimeAsync(0));

    // Callers that define their callbacks inline pass new ones on every render.
    const second = vi.fn().mockResolvedValue({ stream });
    rerender({ connectStream: second });
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    unmount();
  });

  it('retries a start that can still succeed', async () => {
    const connectStream = vi
      .fn()
      .mockResolvedValueOnce({ stream: null, retry: true })
      .mockResolvedValue({ stream: null });
    const terminal = startTerminal(connectStream);

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(connectStream).toHaveBeenCalledTimes(2);

    // A start that cannot succeed, e.g. a disabled terminal, is not retried.
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(connectStream).toHaveBeenCalledTimes(2);
    terminal.unmount();
  });

  it('keeps the terminal and why it failed once it gives up', async () => {
    const closed = { readyState: WebSocket.CLOSED, onclose: null, addEventListener: vi.fn() };
    const terminal = startTerminal(
      vi.fn().mockResolvedValue({ stream: { cancel: vi.fn(), getSocket: () => closed } })
    );

    await act(() => vi.advanceTimersByTimeAsync(61 * 3000));

    expect(writeln).toHaveBeenLastCalledWith(
      expect.stringContaining('Could not open the terminal')
    );
    expect(terminal.onConnectionFailed).not.toHaveBeenCalled();
    expect(terminal.onClose).not.toHaveBeenCalled();
    terminal.unmount();
  });
});
