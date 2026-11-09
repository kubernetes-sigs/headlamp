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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Channel,
  isRetryableStartError,
  onSocketStable,
  reconnectDecision,
  TerminalStreamOptions,
  useTerminalStream,
} from './useTerminalStream';

const mockXtermInstances: any[] = [];
const mockFitAddonInstances: any[] = [];

vi.mock('@mui/material/styles', () => ({
  useTheme: () => ({ palette: { mode: 'dark' } }),
}));

vi.mock('../../components/common/xtermTheme', () => ({
  getXtermTheme: () => ({ background: '#000000' }),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: any, opts: any) {
    this.options = { ...opts };
    this.cols = 80;
    this.rows = 24;
    this.loadAddon = vi.fn();
    this.open = vi.fn();
    this.focus = vi.fn();
    this.clear = vi.fn();
    this.write = vi.fn();
    this.writeln = vi.fn();
    this.dispose = vi.fn();
    this.getSelection = vi.fn(() => '');
    this.onData = vi.fn((cb: (data: string) => void) => {
      this._onDataCb = cb;
    });
    this.onResize = vi.fn((cb: (size: { cols: number; rows: number }) => void) => {
      this._onResizeCb = cb;
    });
    this.attachCustomKeyEventHandler = vi.fn((cb: (ev: KeyboardEvent) => boolean) => {
      this._keyHandler = cb;
    });
    mockXtermInstances.push(this);
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (this: any) {
    this.fit = vi.fn();
    mockFitAddonInstances.push(this);
  }),
}));

function encodeChannel(channel: Channel, text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  const buf = new Uint8Array(bytes.length + 1);
  buf[0] = channel;
  buf.set(bytes, 1);
  return buf.buffer;
}

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
    mockXtermInstances.length = 0;
    mockFitAddonInstances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not initialize terminal when disabled or containerRef is null', () => {
    const connectStream = vi.fn();
    renderHook(() =>
      useTerminalStream({
        connectStream,
        containerRef: null,
        enabled: true,
      })
    );
    expect(connectStream).not.toHaveBeenCalled();

    renderHook(() =>
      useTerminalStream({
        connectStream,
        containerRef: document.createElement('div'),
        enabled: false,
      })
    );
    expect(connectStream).not.toHaveBeenCalled();
  });

  it('connects stream, routes channels, handles resize/keys, and cleans up', async () => {
    const container = document.createElement('div');
    const socket: { readyState: number; send: ReturnType<typeof vi.fn> } = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
    };
    // The hook wraps the stream's cancel, so keep the original to check it is called.
    const cancel = vi.fn();
    const streamMock = {
      getSocket: () => socket,
      cancel,
    };

    let onDataCb: ((data: ArrayBuffer) => void) | undefined;
    const connectStream = vi.fn(async cb => {
      onDataCb = cb;
      return { stream: streamMock, initialMessage: 'Connecting...' };
    });

    const onClose = vi.fn();
    const onConnectionFailed = vi.fn();
    const isSuccessfulExit = vi.fn((_ch, text) => text === 'EXIT_OK');
    const isShellNotFound = vi.fn((_ch, text) => text === 'NO_SHELL');

    const { result, unmount } = renderHook(() =>
      useTerminalStream({
        connectStream,
        containerRef: container,
        enabled: true,
        detectOS: true,
        onClose,
        errorHandlers: { isSuccessfulExit, isShellNotFound, onConnectionFailed },
      })
    );

    await waitFor(() => {
      expect(mockXtermInstances).toHaveLength(1);
      expect(mockXtermInstances[0].open).toHaveBeenCalledWith(container);
    });

    const xterm = mockXtermInstances[0];
    const fitAddon = mockFitAddonInstances[0];
    expect(xterm.writeln).toHaveBeenCalledWith('Connecting...');
    expect(xterm.focus).toHaveBeenCalled();
    expect(fitAddon.fit).toHaveBeenCalled();

    // Window resize triggers fit
    window.dispatchEvent(new Event('resize'));
    expect(fitAddon.fit).toHaveBeenCalledTimes(2);

    // Ignore out-of-range channel (StdIn = 0)
    onDataCb!(encodeChannel(Channel.StdIn, 'ignored'));
    expect(xterm.write).not.toHaveBeenCalled();

    // The session socket is open, so the terminal is connected before any output
    expect(result.current.xtermRef.current?.connected).toBe(true);
    expect(xterm.clear).toHaveBeenCalledTimes(1);
    expect(socket.send).toHaveBeenCalled();

    onDataCb!(encodeChannel(Channel.ServerError, 'err'));
    expect(xterm.write).toHaveBeenCalledWith('err');

    onDataCb!(encodeChannel(Channel.StdOut, 'hello'));
    expect(xterm.write).toHaveBeenCalledWith('hello');
    expect(xterm.clear).toHaveBeenCalledTimes(1);

    // Shell not found triggers onConnectionFailed
    onDataCb!(encodeChannel(Channel.StdErr, 'NO_SHELL'));
    expect(onConnectionFailed).toHaveBeenCalledWith(result.current.xtermRef.current);

    // Successful exit calls onClose and cancels stream
    onDataCb!(encodeChannel(Channel.StdOut, 'EXIT_OK'));
    expect(onClose).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);

    // Custom key event handler: Ctrl+C with selection returns false, without returns true; Ctrl+V returns false
    xterm.getSelection.mockReturnValueOnce('selected');
    expect(
      xterm._keyHandler({ type: 'keydown', ctrlKey: true, code: 'KeyC' } as KeyboardEvent)
    ).toBe(false);
    xterm.getSelection.mockReturnValueOnce('');
    expect(
      xterm._keyHandler({ type: 'keydown', ctrlKey: true, code: 'KeyC' } as KeyboardEvent)
    ).toBe(true);
    expect(
      xterm._keyHandler({ type: 'keydown', ctrlKey: true, code: 'KeyV' } as KeyboardEvent)
    ).toBe(false);

    // German MacOS Alt+7 -> '|'
    xterm._keyHandler({ type: 'keydown', key: '|', code: 'Digit7' } as KeyboardEvent);
    socket.send.mockClear();
    xterm._onDataCb('\u001b7');
    const sentBuf = socket.send.mock.calls[0][0] as Uint8Array;
    expect(sentBuf[0]).toBe(Channel.StdIn);
    expect(new TextDecoder().decode(sentBuf.slice(1))).toBe('|');

    // Keyup resets lastKeyPressEvent, normal data passes through
    xterm._keyHandler({ type: 'keyup', key: '|', code: 'Digit7' } as KeyboardEvent);
    xterm._onDataCb('ls\n');
    expect(new TextDecoder().decode(socket.send.mock.calls[1][0].slice(1))).toBe('ls\n');

    // Terminal resize sends Resize channel
    xterm._onResizeCb({ cols: 120, rows: 40 });
    expect(new TextDecoder().decode(socket.send.mock.calls[2][0].slice(1))).toBe(
      '{"Width":120,"Height":40}'
    );

    // send() when socket is not open is a no-op
    socket.readyState = WebSocket.CLOSED;
    result.current.send(Channel.StdIn, 'nope');
    expect(socket.send).toHaveBeenCalledTimes(3);

    unmount();
    expect(xterm.dispose).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('keeps the session when its callbacks change on a rerender', async () => {
    vi.useFakeTimers();
    try {
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
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useTerminalStream reconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockXtermInstances.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  function lastXterm() {
    return mockXtermInstances[mockXtermInstances.length - 1];
  }

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

  it('retries a connection that drops right after a slow start', async () => {
    let onData: (data: ArrayBuffer) => void = () => {};
    const socket = {
      readyState: WebSocket.OPEN,
      onclose: null as any,
      addEventListener: vi.fn(),
      send: vi.fn(),
    };
    const connectStream = vi.fn(async (cb: (data: ArrayBuffer) => void) => {
      if (connectStream.mock.calls.length <= 11) return { stream: null, retry: true };
      onData = cb;
      return { stream: { cancel: vi.fn(), getSocket: () => socket } };
    });
    const terminal = startTerminal(connectStream);
    await act(() => vi.advanceTimersByTimeAsync(11 * 3000));
    expect(connectStream).toHaveBeenCalledTimes(12);

    // It connects, then drops before the connection counts as stable.
    act(() => onData(new Uint8Array([1, 104]).buffer));
    act(() => socket.onclose({ code: 1006, reason: '' }));
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(connectStream).toHaveBeenCalledTimes(13);
    terminal.unmount();
  });

  it('sends the terminal size once the session socket opens', async () => {
    const socket = Object.assign(fakeSocket(WebSocket.CONNECTING), {
      send: vi.fn(),
      onclose: null,
    });
    const terminal = startTerminal(
      vi.fn().mockResolvedValue({ stream: { cancel: vi.fn(), getSocket: () => socket } })
    );
    await act(() => vi.advanceTimersByTimeAsync(0));

    act(() => socket.open());

    expect(socket.send).toHaveBeenCalledWith(
      new Uint8Array([4, ...new TextEncoder().encode('{"Width":80,"Height":24}')])
    );
    terminal.unmount();
  });

  it('reconnects to an idle shell once its session socket opens', async () => {
    let onData: (data: ArrayBuffer) => void = () => {};
    const first = {
      readyState: WebSocket.OPEN,
      onclose: null as any,
      addEventListener: vi.fn(),
      send: vi.fn(),
    };
    const second = Object.assign(fakeSocket(WebSocket.CONNECTING), {
      send: vi.fn(),
      onclose: null,
    });
    const connectStream = vi.fn(async (cb: (data: ArrayBuffer) => void) => {
      onData = cb;
      const socket = connectStream.mock.calls.length === 1 ? first : second;
      return { stream: { cancel: vi.fn(), getSocket: () => socket } };
    });
    const terminal = startTerminal(connectStream);
    await act(() => vi.advanceTimersByTimeAsync(0));
    act(() => onData(new Uint8Array([1, 104]).buffer));
    act(() => first.onclose({ code: 1006, reason: '' }));
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(connectStream).toHaveBeenCalledTimes(2);

    // The reattached shell prints nothing.
    act(() => second.open());

    expect(lastXterm().writeln).toHaveBeenLastCalledWith(expect.stringContaining('Reconnected!'));
    terminal.unmount();
  });

  it('counts an idle shell as connected once its session socket first opens', async () => {
    const socket = Object.assign(fakeSocket(WebSocket.CONNECTING), {
      send: vi.fn(),
      onclose: null as any,
    });
    const connectStream = vi
      .fn()
      .mockResolvedValue({ stream: { cancel: vi.fn(), getSocket: () => socket } });
    const terminal = startTerminal(connectStream);
    await act(() => vi.advanceTimersByTimeAsync(0));

    // The attached shell prints nothing, then the connection drops.
    act(() => socket.open());
    act(() => socket.onclose({ code: 1006, reason: '' }));

    expect(lastXterm().writeln).toHaveBeenLastCalledWith(
      expect.stringContaining('Connection lost')
    );
    terminal.unmount();
  });

  it('keeps the terminal and why it failed once it gives up', async () => {
    const closed = { readyState: WebSocket.CLOSED, onclose: null, addEventListener: vi.fn() };
    const terminal = startTerminal(
      vi.fn().mockResolvedValue({ stream: { cancel: vi.fn(), getSocket: () => closed } })
    );

    await act(() => vi.advanceTimersByTimeAsync(61 * 3000));

    expect(lastXterm().writeln).toHaveBeenLastCalledWith(
      expect.stringContaining('Could not open the terminal')
    );
    expect(terminal.onConnectionFailed).not.toHaveBeenCalled();
    expect(terminal.onClose).not.toHaveBeenCalled();
    terminal.unmount();
  });
});
