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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel, useTerminalStream } from './useTerminalStream';

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
    const streamMock = {
      getSocket: () => socket,
      cancel: vi.fn(),
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

    // ServerError does not mark connected = true
    onDataCb!(encodeChannel(Channel.ServerError, 'err'));
    expect(result.current.xtermRef.current?.connected).toBe(false);
    expect(xterm.clear).toHaveBeenCalledTimes(1);
    expect(xterm.write).toHaveBeenCalledWith('err');

    // StdOut marks connected = true and writes text
    onDataCb!(encodeChannel(Channel.StdOut, 'hello'));
    expect(result.current.xtermRef.current?.connected).toBe(true);
    expect(xterm.write).toHaveBeenCalledWith('hello');
    expect(socket.send).toHaveBeenCalled();

    // Shell not found triggers onConnectionFailed
    onDataCb!(encodeChannel(Channel.StdErr, 'NO_SHELL'));
    expect(onConnectionFailed).toHaveBeenCalledWith(result.current.xtermRef.current);

    // Successful exit calls onClose and cancels stream
    onDataCb!(encodeChannel(Channel.StdOut, 'EXIT_OK'));
    expect(onClose).toHaveBeenCalled();
    expect(streamMock.cancel).toHaveBeenCalledTimes(1);

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
    expect(streamMock.cancel).toHaveBeenCalledTimes(2);
  });
});
