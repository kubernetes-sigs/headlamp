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

import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerminal } from '@xterm/xterm';
import { useCallback, useEffect, useRef } from 'react';

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

/**
 * WebSocket communication channels for terminal I/O.
 */
export enum Channel {
  StdIn = 0,
  StdOut,
  StdErr,
  ServerError,
  Resize,
}

/**
 * Terminal instance with connection state.
 *
 * @property {XTerminal} xterm - XTerm.js terminal instance
 * @property {boolean} connected - Whether WebSocket is connected
 * @property {boolean} reconnectOnEnter - Whether to reconnect on Enter key
 */
export interface XTerminalConnected {
  xterm: XTerminal;
  connected: boolean;
  reconnectOnEnter: boolean;
}

/**
 * Options for configuring terminal stream behavior.
 */
export interface TerminalStreamOptions {
  /** Function that establishes stream connection */
  connectStream: (onData: (data: ArrayBuffer) => void) => Promise<{
    stream: any;
    initialMessage?: string;
  }>;
  /** Terminal container HTML element */
  containerRef: HTMLElement | null;
  /** Whether terminal should be active */
  enabled?: boolean;
  /** Callback when terminal is closed */
  onClose?: () => void;
  /** Custom error handlers */
  errorHandlers?: {
    isSuccessfulExit?: (channel: number, text: string) => boolean;
    isShellNotFound?: (channel: number, text: string) => boolean;
    onConnectionFailed?: (xtermc: XTerminalConnected) => void;
  };
  /** Whether to detect Windows OS */
  detectOS?: boolean;
  /** Additional xterm configuration */
  xtermOptions?: {
    cursorBlink?: boolean;
    cursorStyle?: 'block' | 'underline' | 'bar';
    scrollback?: number;
    rows?: number;
    windowsMode?: boolean;
  };
}

/**
 * React hook for managing WebSocket-based terminal streams.
 *
 * Sets up an XTerm.js terminal with WebSocket communication, handles I/O channels,
 * resizing, and platform-specific keyboard handling. Auto-connects when enabled
 * and container is available.
 *
 * @param options - Configuration for terminal and stream connection
 * @returns Terminal refs and send function for stdin
 */
export function useTerminalStream(options: TerminalStreamOptions) {
  const {
    connectStream,
    containerRef,
    enabled = true,
    onClose,
    errorHandlers,
    detectOS = false,
    xtermOptions = {},
  } = options;

  const xtermRef = useRef<XTerminalConnected | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const streamRef = useRef<any | null>(null);

  /**
   * Sends data to the terminal stream on the specified channel.
   *
   * @param channel - I/O channel (stdin, resize, etc.)
   * @param data - Data string to send
   */
  const send = useCallback((channel: number, data: string) => {
    const socket = streamRef.current?.getSocket();

    // We should only send data if the socket is ready.
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.debug('Could not send data: Socket not ready...', socket);
      return;
    }

    const encoded = encoder.encode(data);
    const buffer = new Uint8Array([channel, ...encoded]);

    socket.send(buffer);
  }, []);

  /**
   * Handles incoming data from WebSocket stream.
   * Processes channel routing, connection setup, and error handling.
   */
  const onData = useCallback(
    (xtermc: XTerminalConnected, bytes: ArrayBuffer) => {
      const xterm = xtermc.xterm;

      // Only show data from stdout, stderr and server error channel.
      const channel: Channel = new Int8Array(bytes.slice(0, 1))[0];
      if (channel < Channel.StdOut || channel > Channel.ServerError) {
        return;
      }

      // The first byte is discarded because it just identifies whether
      // this data is from stderr, stdout, or stdin.
      const data = bytes.slice(1);
      const text = decoder.decode(data);

      // Send resize command to server once connection is established.
      if (!xtermc.connected) {
        xterm.clear();
        send(Channel.Resize, `{"Width":${xterm.cols},"Height":${xterm.rows}}`);
        // On server error, don't set it as connected
        if (channel !== Channel.ServerError) {
          xtermc.connected = true;
          console.debug('Terminal is now connected');
        }
      }

      // Use custom error handlers if provided
      if (errorHandlers?.isSuccessfulExit?.(channel, text)) {
        onClose?.();
        streamRef.current?.cancel();
        return;
      }

      if (errorHandlers?.isShellNotFound?.(channel, text)) {
        errorHandlers?.onConnectionFailed?.(xtermc);
        return;
      }

      xterm.write(text);
    },
    [errorHandlers, onClose, send]
  );

  /**
   * Initializes terminal in DOM and sets up event handlers.
   * Configures keyboard input, resize handling, and copy/paste.
   */
  const setupTerminal = useCallback(
    (containerEl: HTMLElement, xterm: XTerminal, fitAddon: FitAddon) => {
      if (!containerEl) {
        return;
      }

      xterm.open(containerEl);

      let lastKeyPressEvent: KeyboardEvent | null = null;
      xterm.onData(data => {
        let dataToSend = data;

        // On MacOS with a German layout, the Alt+7 should yield a | character, but
        // the onData event doesn't get it. So we need to add a custom key handler.
        // No need to check for the actual platform because the key patterns should
        // be good enough.
        if (
          data === '\u001b7' &&
          lastKeyPressEvent?.key === '|' &&
          lastKeyPressEvent.code === 'Digit7'
        ) {
          dataToSend = '|';
        }

        send(Channel.StdIn, dataToSend);
      });

      xterm.onResize(size => {
        send(Channel.Resize, `{"Width":${size.cols},"Height":${size.rows}}`);
      });

      // Allow copy/paste in terminal
      xterm.attachCustomKeyEventHandler(arg => {
        if (arg.type === 'keydown') {
          lastKeyPressEvent = arg;
        } else {
          lastKeyPressEvent = null;
        }

        if (arg.ctrlKey && arg.type === 'keydown') {
          if (arg.code === 'KeyC') {
            const selection = xterm.getSelection();
            if (selection) {
              return false;
            }
          }
          if (arg.code === 'KeyV') {
            return false;
          }
        }

        return true;
      });

      fitAddon.fit();
    },
    [send]
  );

  useEffect(() => {
    if (!containerRef || !enabled) {
      return;
    }

    if (xtermRef.current) {
      xtermRef.current.xterm.dispose();
      streamRef.current?.cancel();
    }

    const isWindows =
      detectOS && ['Windows', 'Win16', 'Win32', 'WinCE'].indexOf(navigator?.platform) >= 0;

    const defaultOptions = {
      cursorBlink: true,
      cursorStyle: 'underline' as const,
      scrollback: 10000,
      rows: 30,
      windowsMode: isWindows,
      allowProposedApi: true,
    };

    xtermRef.current = {
      xterm: new XTerminal({
        ...defaultOptions,
        ...xtermOptions,
      }),
      connected: false,
      reconnectOnEnter: false,
    };

    fitAddonRef.current = new FitAddon();
    xtermRef.current.xterm.loadAddon(fitAddonRef.current);

    (async function () {
      const { stream, initialMessage } = await connectStream((items: ArrayBuffer) =>
        onData(xtermRef.current!, items)
      );

      if (initialMessage) {
        xtermRef.current?.xterm.writeln(initialMessage);
      }

      streamRef.current = stream;

      setupTerminal(containerRef, xtermRef.current!.xterm, fitAddonRef.current!);
    })();

    const resizeHandler = () => {
      fitAddonRef.current?.fit();
    };

    window.addEventListener('resize', resizeHandler);

    return function cleanup() {
      xtermRef.current?.xterm.dispose();
      streamRef.current?.cancel();
      window.removeEventListener('resize', resizeHandler);
    };
  }, [containerRef, enabled, send, onData, setupTerminal, connectStream]);

  return {
    xtermRef,
    fitAddonRef,
    streamRef,
    send,
  };
}
