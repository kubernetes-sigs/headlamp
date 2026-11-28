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

import { act, fireEvent, render, screen } from '@testing-library/react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerminal } from '@xterm/xterm';
import React from 'react';
import { TestContext } from '../../test';
import Terminal from './Terminal';

const encoder = new TextEncoder();

const Channel = {
  StdOut: 1,
  ServerError: 3,
} as const;

function buildMessage(channel: number, text: string): ArrayBuffer {
  const encoded = encoder.encode(text);
  const buffer = new Uint8Array([channel, ...encoded]);
  return buffer.buffer;
}

/** Minimal pod-shaped mock for Terminal (no Pod import to avoid k8s chain in isolation). */
function createMockPod(
  exec: (
    c: string,
    onData: (d: ArrayBuffer) => void,
    opts?: { command?: string[]; failCb?: () => void }
  ) => Promise<unknown>,
  attachOrOs?:
    | string
    | ((
        c: string,
        onData: (d: ArrayBuffer) => void,
        opts?: { command?: string[]; failCb?: () => void }
      ) => Promise<unknown>),
  maybeAttach?: (
    c: string,
    onData: (d: ArrayBuffer) => void,
    opts?: { command?: string[]; failCb?: () => void }
  ) => Promise<unknown>
) {
  const os = typeof attachOrOs === 'string' ? attachOrOs : 'linux';
  const attach = typeof attachOrOs === 'function' ? attachOrOs : maybeAttach ?? exec;

  return {
    metadata: { name: 'mock-pod' },
    spec: {
      nodeSelector: { 'kubernetes.io/os': os },
      containers: [{ name: 'main' }],
      initContainers: [],
      ephemeralContainers: [],
    },
    exec,
    attach,
  };
}

describe('Terminal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not throw when stream emits data after unmount (send/onData after cleanup)', async () => {
    const cancel = vi.fn();
    const writeSpy = vi.spyOn(XTerminal.prototype, 'write').mockImplementation(() => {});
    try {
      const streamReturn = {
        cancel,
        getSocket: () => ({ readyState: 1, send: () => {} } as unknown as WebSocket),
      };
      const pod = createMockPod(async (_container: string, onData: (data: ArrayBuffer) => void) => {
        await Promise.resolve();
        setTimeout(() => onData(buildMessage(Channel.StdOut, 'late data after unmount')), 100);
        return streamReturn;
      });

      const { unmount } = render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      unmount();
      expect(cancel).toHaveBeenCalled();

      await act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(writeSpy).not.toHaveBeenCalledWith(expect.stringContaining('late data after unmount'));
    } finally {
      writeSpy.mockRestore();
    }
  });

  describe('initialContainer', () => {
    it('uses initialContainer when it matches a known container', async () => {
      let capturedContainer: string | undefined;
      const pod = {
        ...createMockPod(async (container: string) => {
          capturedContainer = container;
          return { cancel: () => {}, getSocket: () => null };
        }),
        spec: {
          nodeSelector: { 'kubernetes.io/os': 'linux' },
          containers: [{ name: 'main' }, { name: 'sidecar' }],
          initContainers: [],
          ephemeralContainers: [],
        },
      };

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} initialContainer="sidecar" />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(capturedContainer).toBe('sidecar');
    });

    it('falls back to default container when initialContainer is invalid', async () => {
      let capturedContainer: string | undefined;
      const pod = createMockPod(async (container: string) => {
        capturedContainer = container;
        return { cancel: () => {}, getSocket: () => null };
      });

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} initialContainer="nonexistent" />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(capturedContainer).toBe('main');
    });

    it('uses default container when initialContainer is not specified', async () => {
      let capturedContainer: string | undefined;
      const pod = createMockPod(async (container: string) => {
        capturedContainer = container;
        return { cancel: () => {}, getSocket: () => null };
      });

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(capturedContainer).toBe('main');
    });
  });

  describe('context menu (Electron)', () => {
    async function renderTerminal(socket: { readyState: number; send: (d: any) => void } | null) {
      const streamReturn = {
        cancel: () => {},
        getSocket: () => socket,
      };
      const pod = createMockPod(async () => streamReturn);

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));
    }

    let getSelectionSpy: ReturnType<typeof vi.spyOn> | null = null;
    const originalUserAgent = window.navigator.userAgent;

    beforeEach(() => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Electron',
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: originalUserAgent,
        configurable: true,
      });
      getSelectionSpy?.mockRestore();
      getSelectionSpy = null;
      delete (navigator as any).clipboard;
      vi.restoreAllMocks();
    });

    it('shows the context menu with Copy and Paste on right click', async () => {
      await renderTerminal({ readyState: 1, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);

      expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeInTheDocument();
    });

    it('disables Paste when the socket is not ready', async () => {
      await renderTerminal({ readyState: 0, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);

      expect(screen.getByRole('menuitem', { name: 'Paste' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    });

    it('disables Copy when there is no selection', async () => {
      getSelectionSpy = vi.spyOn(XTerminal.prototype, 'getSelection').mockReturnValue('');
      await renderTerminal({ readyState: 1, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);

      expect(screen.getByRole('menuitem', { name: 'Copy' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    });

    it('copies the current selection to the clipboard', async () => {
      getSelectionSpy = vi
        .spyOn(XTerminal.prototype, 'getSelection')
        .mockReturnValue('selected text');
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      await renderTerminal({ readyState: 1, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
      await act(() => new Promise(res => process.nextTick(res)));

      expect(writeText).toHaveBeenCalledWith('selected text');
    });

    it('sends pasted clipboard text over the socket on stdin channel 0', async () => {
      const send = vi.fn();
      const readText = vi.fn().mockResolvedValue('pasted text');
      Object.assign(navigator, { clipboard: { readText } });

      await renderTerminal({ readyState: 1, send });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
      await act(() => new Promise(res => process.nextTick(res)));

      expect(readText).toHaveBeenCalled();
      expect(send).toHaveBeenCalled();
      const sentBuffer = send.mock.calls[0][0] as ArrayBuffer;
      const sentBytes = new Uint8Array(sentBuffer);
      expect(sentBytes[0]).toBe(0);
      expect(new TextDecoder().decode(sentBytes.slice(1))).toBe('pasted text');
    });

    it('handles clipboard copy/paste errors gracefully and closes context menu', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      getSelectionSpy = vi.spyOn(XTerminal.prototype, 'getSelection').mockReturnValue('sel');
      Object.assign(navigator, {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('copy fail')),
          readText: vi.fn().mockRejectedValue(new Error('paste fail')),
        },
      });

      await renderTerminal({ readyState: 1, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
      await act(() => new Promise(res => process.nextTick(res)));
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('menuitem', { name: 'Copy' })).not.toBeInTheDocument();

      fireEvent.contextMenu(document.getElementById('xterm-container')!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
      await act(() => new Promise(res => process.nextTick(res)));
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByRole('menuitem', { name: 'Paste' })).not.toBeInTheDocument();

      expect(errorSpy).toHaveBeenCalledTimes(2);
      errorSpy.mockRestore();
    });
  });

  describe('exec, attach, shell fallback, and terminal events', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('supports noDialog, isAttach, empty firstConnect message, and newline normalization', async () => {
      let capturedOnData!: (d: ArrayBuffer) => void;
      const writeSpy = vi.spyOn(XTerminal.prototype, 'write').mockImplementation(() => {});
      const clearSpy = vi.spyOn(XTerminal.prototype, 'clear').mockImplementation(() => {});
      const execSpy = vi.fn(async () => ({ cancel: () => {}, getSocket: () => null }));
      const attachSpy = vi.fn(async (_c: string, onData: (d: ArrayBuffer) => void) => {
        capturedOnData = onData;
        return { cancel: () => {}, getSocket: () => ({ readyState: 1, send: () => {} }) };
      });
      const pod = createMockPod(execSpy, attachSpy);

      render(
        <TestContext>
          <Terminal item={pod as any} open noDialog isAttach onClose={() => {}} />
        </TestContext>
      );

      await act(() => new Promise(res => process.nextTick(res)));

      expect(attachSpy).toHaveBeenCalled();
      expect(execSpy).not.toHaveBeenCalled();

      // Ignored channel (0 and 4)
      act(() => {
        capturedOnData(buildMessage(0, 'ignored'));
        capturedOnData(buildMessage(4, 'ignored'));
      });

      // Empty firstConnect on StdOut
      act(() => {
        capturedOnData(buildMessage(1, ''));
      });
      expect(clearSpy).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalledWith(
        expect.stringContaining("Any new output for this container's process")
      );

      // Newline normalization
      act(() => {
        capturedOnData(buildMessage(1, 'line1\nline2\r\n'));
      });
      expect(writeSpy).toHaveBeenCalledWith('line1\r\nline2\r\n');
    });

    it('closes and cancels on successful exit error, and falls back through shells on failure', async () => {
      const onClose = vi.fn();
      const cancel = vi.fn();
      let capturedOnData!: (d: ArrayBuffer) => void;
      let capturedFailCb: (() => void) | undefined;
      const commands: string[][] = [];
      const writeSpy = vi.spyOn(XTerminal.prototype, 'write').mockImplementation(() => {});
      const clearSpy = vi.spyOn(XTerminal.prototype, 'clear').mockImplementation(() => {});

      const pod = {
        ...createMockPod(async () => ({ cancel, getSocket: () => null })),
        spec: {
          nodeSelector: { 'kubernetes.io/os': 'windows' },
          containers: [{ name: 'main' }],
          initContainers: [{ name: 'init-c' }],
          ephemeralContainers: [{ name: 'eph-c' }],
        },
        exec: async (_c: string, onData: (d: ArrayBuffer) => void, opts: any) => {
          capturedOnData = onData;
          capturedFailCb = opts.failCb;
          commands.push(opts.command);
          return { cancel, getSocket: () => ({ readyState: 0, send: () => {} }) };
        },
      };

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={onClose} />
        </TestContext>
      );

      await act(() => new Promise(res => process.nextTick(res)));
      expect(commands[0]).toEqual(['powershell.exe']);

      // Invalid JSON on channel 3 -> writes raw text directly
      act(() => {
        capturedOnData(buildMessage(3, 'not-json'));
      });
      expect(writeSpy).toHaveBeenCalledWith('not-json');

      // Windows shell not found error on channel 1 -> tries next shell (cmd.exe)
      act(() => {
        capturedOnData(buildMessage(1, 'The system cannot find the file specified'));
      });
      await act(() => new Promise(res => process.nextTick(res)));
      expect(commands[1]).toEqual(['cmd.exe']);

      // Last shell fails while not connected
      clearSpy.mockClear();
      writeSpy.mockClear();
      act(() => {
        capturedFailCb?.();
      });
      expect(clearSpy).toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalledWith('Failed to connect…\r\n');

      // Successful exit on channel 3
      cancel.mockClear();
      act(() => {
        capturedOnData(buildMessage(3, JSON.stringify({ metadata: {}, status: 'Success' })));
      });
      expect(onClose).toHaveBeenCalled();
      expect(cancel).toHaveBeenCalled();
    });

    it('handles Linux InternalError shell fallback, German Alt+7 pipe, Ctrl+C/V, Enter reconnect, and resize', async () => {
      const send = vi.fn();
      let capturedOnData!: (d: ArrayBuffer) => void;
      let dataHandler: ((data: string) => void) | undefined;
      let resizeHandler: ((size: { cols: number; rows: number }) => void) | undefined;
      let keyHandler: ((ev: KeyboardEvent) => boolean) | undefined;

      vi.spyOn(XTerminal.prototype as any, 'onData', 'get').mockReturnValue(
        (cb: (data: string) => void) => {
          dataHandler = cb;
          return { dispose: () => {} };
        }
      );
      vi.spyOn(XTerminal.prototype as any, 'onResize', 'get').mockReturnValue(
        (cb: (size: { cols: number; rows: number }) => void) => {
          resizeHandler = cb;
          return { dispose: () => {} };
        }
      );
      vi.spyOn(XTerminal.prototype, 'attachCustomKeyEventHandler').mockImplementation(
        (cb: (ev: KeyboardEvent) => boolean) => {
          keyHandler = cb;
        }
      );
      vi.spyOn(XTerminal.prototype, 'getSelection').mockReturnValue('copied');
      const fitSpy = vi.spyOn(FitAddon.prototype, 'fit').mockImplementation(() => {});

      const pod = {
        ...createMockPod(async () => ({ cancel: () => {}, getSocket: () => null })),
        spec: {
          containers: [{ name: 'main' }, { name: 'sidecar' }],
          initContainers: [{ name: 'init1' }],
          ephemeralContainers: [{ name: 'eph1' }],
        },
        exec: async (_c: string, onData: (d: ArrayBuffer) => void) => {
          capturedOnData = onData;
          return { cancel: () => {}, getSocket: () => ({ readyState: 1, send }) };
        },
      };

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(() => new Promise(res => process.nextTick(res)));

      // Connect on StdOut first
      act(() => {
        capturedOnData(buildMessage(1, 'hello'));
      });

      // Custom key handler: German Alt+7 -> '|'
      expect(keyHandler?.(new KeyboardEvent('keydown', { key: '|', code: 'Digit7' }))).toBe(true);
      dataHandler?.('\u001b7');
      const pipeBytes = new Uint8Array(send.mock.calls[send.mock.calls.length - 1][0]);
      expect(new TextDecoder().decode(pipeBytes.slice(1))).toBe('|');

      // Ctrl+C with selection -> false; Ctrl+V -> false; keyup -> true
      expect(keyHandler?.(new KeyboardEvent('keydown', { ctrlKey: true, code: 'KeyC' }))).toBe(
        false
      );
      expect(keyHandler?.(new KeyboardEvent('keydown', { ctrlKey: true, code: 'KeyV' }))).toBe(
        false
      );
      expect(keyHandler?.(new KeyboardEvent('keyup', { code: 'KeyC' }))).toBe(true);

      // Resize
      resizeHandler?.({ cols: 120, rows: 40 });
      const resizeBytes = new Uint8Array(send.mock.calls[send.mock.calls.length - 1][0]);
      expect(resizeBytes[0]).toBe(4);
      expect(JSON.parse(new TextDecoder().decode(resizeBytes.slice(1)))).toEqual({
        Width: 120,
        Height: 40,
      });

      // Window resize event
      fitSpy.mockClear();
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(fitSpy).toHaveBeenCalled();

      // Trigger InternalError on channel 3 across remaining shells until reconnectOnEnter
      for (let i = 0; i < 6; i++) {
        act(() => {
          capturedOnData(
            buildMessage(
              3,
              JSON.stringify({ code: 500, status: 'Failure', reason: 'InternalError' })
            )
          );
        });
        await act(() => new Promise(res => process.nextTick(res)));
      }

      // Press Enter when reconnectOnEnter is true
      const reconnectExecSpy = vi.spyOn(pod, 'exec');
      act(() => {
        expect(keyHandler?.(new KeyboardEvent('keydown', { code: 'Enter' }))).toBe(false);
      });
      await act(() => new Promise(res => process.nextTick(res)));
      expect(reconnectExecSpy).toHaveBeenCalledWith(
        'main',
        expect.any(Function),
        expect.objectContaining({ command: ['bash'] })
      );
      reconnectExecSpy.mockRestore();

      // Change container via Select
      const execSpy = vi.spyOn(pod, 'exec');
      const selectBtn = document.getElementById('container-name-chooser')!;
      fireEvent.mouseDown(selectBtn);
      fireEvent.click(screen.getByRole('option', { name: 'sidecar' }));
      await act(() => new Promise(res => process.nextTick(res)));
      expect(execSpy).toHaveBeenCalledWith('sidecar', expect.any(Function), expect.any(Object));
      execSpy.mockRestore();
    });
  });

  describe('reconnect and shell cycling', () => {
    let rafSpy: ReturnType<typeof vi.spyOn> | null = null;

    beforeEach(() => {
      rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    });

    afterEach(() => {
      rafSpy?.mockRestore();
      rafSpy = null;
    });
    it('renders a Reconnect button disabled while connecting', async () => {
      const pod = createMockPod(async () => ({ cancel: () => {}, getSocket: () => null }));

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const button = screen.getByRole('button', { name: 'Reconnect' });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('enables Reconnect button after connection is closed and triggers a new session on click', async () => {
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      const execMock = vi
        .fn()
        .mockImplementation(
          async (
            _container: string,
            onData: (d: ArrayBuffer) => void,
            opts?: { command?: string[]; failCb?: () => void }
          ) => {
            onDataCallback = onData;
            failCallback = opts?.failCb;
            return {
              cancel: vi.fn(),
              getSocket: () => null,
            };
          }
        );
      const pod = createMockPod(execMock);

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(execMock).toHaveBeenCalledTimes(1);
      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeDisabled();

      // Establish connection
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(reconnectButton).toBeDisabled();

      // Drop connection
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(reconnectButton).toBeEnabled();

      fireEvent.click(reconnectButton);

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(execMock).toHaveBeenCalledTimes(2);
      expect(reconnectButton).toBeDisabled();
    });

    it('does not cycle shells when an already connected session fails', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          if (opts?.command?.[0]) {
            executedCommands.push(opts.command[0]);
          }
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // Simulate connection establishment by sending stdout data
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();

      // Simulate mid-session connection drop
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Should NOT have cycled to '/bin/bash'
      expect(executedCommands).toEqual(['bash']);
      expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();

      // Clicking reconnect should retry with the same shell
      fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash', 'bash']);
    });

    it('cycles to next shell when initial shell connection fails', async () => {
      const executedCommands: string[] = [];

      const pod = createMockPod(
        async (
          _container: string,
          _onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          if (opts?.command?.[0]) {
            executedCommands.push(opts.command[0]);
          }
          setTimeout(() => opts?.failCb?.(), 10);
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Should have attempted fallback shells
      expect(executedCommands.length).toBeGreaterThan(1);
      expect(executedCommands[0]).toBe('bash');
      expect(executedCommands[1]).toBe('/bin/bash');
    });

    it('preserves negotiated fallback shell when reconnecting established session', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          if (cmd === 'bash') {
            // First shell fails during initial negotiation
            setTimeout(() => opts?.failCb?.(), 10);
          } else {
            // Second shell connects successfully
            onDataCallback = onData;
            failCallback = opts?.failCb;
          }
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      // Let initial failure cycle to second shell
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash', '/bin/bash']);

      // Establish connection on second shell
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'sh-4.2$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Drop connection
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // Click reconnect: should preserve '/bin/bash' and NOT reset to 'bash'
      fireEvent.click(reconnectButton);

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash', '/bin/bash', '/bin/bash']);
    });

    it('does not display enter key reconnect hint for attach sessions', async () => {
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      const writeSpy = vi.spyOn(XTerminal.prototype, 'write');

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} isAttach open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish connection
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'attached output\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Drop connection
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const calls = writeSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg => msg.includes('Connection closed.'))).toBe(true);
      expect(calls.some(msg => msg.includes('Press the enter key to reconnect.'))).toBe(false);

      writeSpy.mockRestore();
    });

    it('preserves terminal instance and scrollback across reconnection', async () => {
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      const disposeSpy = vi.spyOn(XTerminal.prototype, 'dispose');
      const clearSpy = vi.spyOn(XTerminal.prototype, 'clear');

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish connection
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'first session output\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Drop connection
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const disposeCallsBeforeReconnect = disposeSpy.mock.calls.length;
      clearSpy.mockClear();

      // Click reconnect
      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      fireEvent.click(reconnectButton);

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Terminal should NOT have been disposed on reconnect
      expect(disposeSpy.mock.calls.length).toBe(disposeCallsBeforeReconnect);

      // Reconnected session sends data: terminal should NOT be cleared, preserving scrollback
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'second session output\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(clearSpy).not.toHaveBeenCalled();

      disposeSpy.mockRestore();
      clearSpy.mockRestore();
    });

    it('resets shell index to first shell when Enter is pressed after exhausting all shells', async () => {
      const executedCommands: string[] = [];
      let keyEventHandler: ((e: KeyboardEvent) => boolean) | undefined;

      const originalAttach = XTerminal.prototype.attachCustomKeyEventHandler;
      const attachSpy = vi
        .spyOn(XTerminal.prototype, 'attachCustomKeyEventHandler')
        .mockImplementation(function (this: any, handler: (e: KeyboardEvent) => boolean) {
          keyEventHandler = handler;
          return originalAttach.call(this, handler);
        });

      const pod = createMockPod(
        async (
          _container: string,
          _onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          setTimeout(() => opts?.failCb?.(), 10);
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      // Advance timers so all 4 linux shells fail in sequence: bash -> /bin/bash -> sh -> /bin/sh
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          vi.advanceTimersByTime(50);
        });
        await act(() => new Promise(res => process.nextTick(res)));
      }

      expect(executedCommands).toEqual(['bash', '/bin/bash', 'sh', '/bin/sh']);

      // Enter key pressed via the custom key event handler
      expect(keyEventHandler).toBeDefined();
      await act(async () => {
        keyEventHandler!({
          type: 'keydown',
          code: 'Enter',
        } as KeyboardEvent);
      });

      for (let i = 0; i < 4; i++) {
        await act(async () => {
          vi.advanceTimersByTime(50);
        });
        await act(() => new Promise(res => process.nextTick(res)));
      }

      // Should restart from 'bash' (index 0) rather than staying on '/bin/sh'
      expect(executedCommands).toEqual([
        'bash',
        '/bin/bash',
        'sh',
        '/bin/sh',
        'bash',
        '/bin/bash',
        'sh',
        '/bin/sh',
      ]);

      attachSpy.mockRestore();
    });

    it('does not clear terminal output when reconnect attempt fails through the last shell and retries', async () => {
      const clearSpy = vi.spyOn(XTerminal.prototype, 'clear');
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      let isInitialConnect = true;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          if (isInitialConnect) {
            onDataCallback = onData;
            failCallback = opts?.failCb;
          } else {
            // Reconnect attempts fail
            setTimeout(() => opts?.failCb?.(), 10);
          }
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish initial connection
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Clear spy after initial connection establishment
      clearSpy.mockClear();

      // Drop connection
      isInitialConnect = false;
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // Trigger first reconnect attempt, which fails through fallback shells
      fireEvent.click(reconnectButton);

      // Advance through all fallback shells
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          vi.advanceTimersByTime(50);
        });
        await act(() => new Promise(res => process.nextTick(res)));
      }

      // clear() must NOT have been called during reconnect failure
      expect(clearSpy).not.toHaveBeenCalled();

      // Trigger second reconnect attempt (another retry)
      expect(reconnectButton).toBeEnabled();
      fireEvent.click(reconnectButton);

      // Advance through fallback shells again
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          vi.advanceTimersByTime(50);
        });
        await act(() => new Promise(res => process.nextTick(res)));
      }

      // clear() must STILL NOT have been called across subsequent retries
      expect(clearSpy).not.toHaveBeenCalled();

      clearSpy.mockRestore();
    });

    it('does not throw or dereference a cleared terminal ref when late stream failure callback fires after cleanup', async () => {
      let failCallback: (() => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          _onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      const { unmount } = render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(failCallback).toBeDefined();

      // Unmount the terminal to clear xtermRef.current and run cleanup
      unmount();

      // Late stream failure callback fires after terminal unmount and cleanup
      expect(() => {
        failCallback!();
      }).not.toThrow();
    });

    it('restores the last successful shell when reconnecting after failed reconnect retries exhaust fallback shells', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      let shouldFail = false;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          if (shouldFail) {
            setTimeout(() => opts?.failCb?.(), 10);
          } else {
            onDataCallback = onData;
            failCallback = opts?.failCb;
          }
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // Initial connection succeeds on 'bash'
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Connection drops mid-session
      shouldFail = true;
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // Trigger first reconnect attempt: transport failure on known shell does NOT cycle fallback shells
      fireEvent.click(reconnectButton);

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Only one attempt per reconnect on the known shell
      expect(executedCommands).toEqual(['bash', 'bash']);

      // Network recovers: user clicks Reconnect again
      shouldFail = false;
      expect(reconnectButton).toBeEnabled();
      fireEvent.click(reconnectButton);

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Retries the known negotiated shell
      expect(executedCommands).toEqual(['bash', 'bash', 'bash']);
    });

    it('marks initial attach failure as disconnected and enables reconnect', async () => {
      const pod = createMockPod(
        async (
          _container: string,
          _onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          setTimeout(() => opts?.failCb?.(), 10);
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open isAttach onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();
    });

    it('prevents duplicate stream failures from restarting shell negotiation', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Successfully connect
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // Simulate duplicate failCb calls from the same stream (e.g. error + close events)
      await act(async () => {
        failCallback?.();
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Should not have cycled to '/bin/bash'
      expect(executedCommands).toEqual(['bash']);
    });

    it('handles error frame followed by socket close without double-failing or shell cycling', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // 1. stdout: successfully connect established session
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // 2. error frame (channel 3) followed by socket close (failCb)
      await act(async () => {
        onDataCallback?.(
          buildMessage(
            Channel.ServerError,
            JSON.stringify({
              code: 500,
              status: 'Failure',
              reason: 'InternalError',
              message:
                'OCI runtime exec failed: exec failed: unable to start container process: exec: "bash": executable file not found in $PATH',
            })
          )
        );
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Must remain on 'bash' and NOT cycle to '/bin/bash'
      expect(executedCommands).toEqual(['bash']);

      // Reconnect button must be enabled
      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();
    });

    it('focuses the terminal when Reconnect button is clicked', async () => {
      const focusSpy = vi.spyOn(XTerminal.prototype, 'focus');
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Connect established session
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Disconnect
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      focusSpy.mockClear();

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      fireEvent.click(reconnectButton);

      expect(focusSpy).toHaveBeenCalled();
    });

    it('falls back to the next shell when empty stdout frame is followed by shell-not-found error', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // 1. Empty stdout readiness frame (should NOT mark session connected)
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, ''));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // 2. bash not found in container (channel 3 500 error) followed by socket close
      await act(async () => {
        onDataCallback?.(
          buildMessage(
            Channel.ServerError,
            JSON.stringify({
              code: 500,
              status: 'Failure',
              reason: 'InternalError',
              message:
                'OCI runtime exec failed: exec failed: unable to start container process: exec: "bash": executable file not found in $PATH',
            })
          )
        );
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Must have fallen back to '/bin/bash'
      expect(executedCommands).toEqual(['bash', '/bin/bash']);
    });

    it('falls back from powershell.exe to cmd.exe when Windows stdout reports shell not found', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        },
        'windows'
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['powershell.exe']);

      // Windows shell-not-found error arrives on Channel.StdOut (channel 1)
      await act(async () => {
        onDataCallback?.(
          buildMessage(Channel.StdOut, 'The system cannot find the file specified.\r\n')
        );
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Assert fallback from powershell.exe to cmd.exe rather than treating as established-session disconnect
      expect(executedCommands).toEqual(['powershell.exe', 'cmd.exe']);
    });

    it('preserves negotiated shell and enables reconnect when a silent session drops', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // 1. Silent shell starts: empty stdout frame (e.g. PS1='')
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, ''));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // 2. Mid-session connection drop (socket closes without shell-not-found error)
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Asserts the terminal remains on 'bash' and does NOT cycle to '/bin/bash'
      expect(executedCommands).toEqual(['bash']);

      // Reconnect button must be enabled
      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();
    });

    it('keeps reconnect no-clear behavior sticky when reconnect attempts receive server-error frames', async () => {
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      const clearSpy = vi.spyOn(XTerminal.prototype, 'clear');

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish session with output
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'initial scrollback output\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Disconnect
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      clearSpy.mockClear();

      // Trigger reconnect attempt that receives server-error frames across all fallbacks
      fireEvent.click(reconnectButton);
      for (let i = 0; i < 4; i++) {
        await act(async () => {
          onDataCallback?.(
            buildMessage(
              Channel.ServerError,
              JSON.stringify({ code: 500, status: 'Failure', reason: 'InternalError' })
            )
          );
          failCallback?.();
          vi.advanceTimersByTime(50);
        });
        await act(() => new Promise(res => process.nextTick(res)));
      }

      expect(reconnectButton).toBeEnabled();

      // Trigger second reconnect attempt that recovers
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'recovered session output\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Terminal clear should never have been called, preserving scrollback
      expect(clearSpy).not.toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    it('does not treat normal Windows command stdout containing file-not-found as a disconnect', async () => {
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      const writeSpy = vi.spyOn(XTerminal.prototype, 'write');

      const pod = createMockPod(async (_container: string, onData: (d: ArrayBuffer) => void) => {
        onDataCallback = onData;
        return { cancel: () => {}, getSocket: () => null };
      }, 'windows');

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish session with prompt output
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'PS C:\\> '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeDisabled();

      // Normal command in Windows prints "The system cannot find the file specified" on stdout
      await act(async () => {
        onDataCallback?.(
          buildMessage(Channel.StdOut, 'The system cannot find the file specified.\r\n')
        );
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Session must remain connected, not disconnected
      expect(reconnectButton).toBeDisabled();
      const calls = writeSpy.mock.calls.map(call => String(call[0]));
      expect(calls.some(msg => msg.includes('The system cannot find the file specified.'))).toBe(
        true
      );
      expect(calls.some(msg => msg.includes('Connection closed.'))).toBe(false);

      writeSpy.mockRestore();
    });

    it('preserves established shell and enables reconnect when a silent session receives a generic server error', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // 1. Silent shell establishes connection via empty stdout frame
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, ''));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // 2. Generic 500 server error arrives mid-session (without missing-executable diagnostic)
      await act(async () => {
        onDataCallback?.(
          buildMessage(
            Channel.ServerError,
            JSON.stringify({ code: 500, status: 'Failure', reason: 'InternalError' })
          )
        );
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Must remain on 'bash' and NOT cycle to '/bin/bash'
      expect(executedCommands).toEqual(['bash']);

      // Reconnect button must be enabled
      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // Clicking reconnect retries the same shell
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash', 'bash']);
    });

    it('restores the normal buffer on exec reconnect without clearing history when connection drops in alternate buffer', async () => {
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish session and write normal buffer output
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'command output in normal buffer\r\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Program enters alternate buffer (e.g. vim: \x1b[?1049h)
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, '\x1b[?1049hvim running in alt buffer\r\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Disconnect while in alternate buffer
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // Reconnect: handleReconnect sends buffer reset and disables mouse tracking
      const writeSpy = vi.spyOn(XTerminal.prototype, 'write');
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(
        writeSpy.mock.calls.some(call =>
          String(call[0]).includes(
            '\x1b[?1049l\x1b[?25h\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l'
          )
        )
      ).toBe(true);
      writeSpy.mockRestore();

      // New exec output in normal buffer
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'new session prompt:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));
    });

    it('preserves saved shell and does not cycle fallbacks when a generic server error is the first frame after reconnecting', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // 1. Establish session with output
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // 2. Mid-session connection drop
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // 3. User clicks Reconnect
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Attempted 'bash' for reconnect
      expect(executedCommands).toEqual(['bash', 'bash']);

      // 4. First frame received after reconnect is a generic server error (500 InternalError without missing-executable diagnostic)
      await act(async () => {
        onDataCallback?.(
          buildMessage(
            Channel.ServerError,
            JSON.stringify({
              code: 500,
              status: 'Failure',
              reason: 'InternalError',
              message: 'failed to exec in container: container is not running',
            })
          )
        );
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Must NOT have cycled to '/bin/bash'; it should remain on 'bash'
      expect(executedCommands).toEqual(['bash', 'bash']);
      expect(reconnectButton).toBeEnabled();

      // 5. Subsequent reconnect retries 'bash' again
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash', 'bash', 'bash']);
    });

    it('does not emit alternate buffer exit sequence and preserves buffer contents on normal buffer reconnect', async () => {
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;
      let xtermInstance: any = null;

      const origOpen = XTerminal.prototype.open;
      const openSpy = vi
        .spyOn(XTerminal.prototype, 'open')
        .mockImplementation(function (this: any, ...args) {
          xtermInstance = this;
          return origOpen.apply(this, args);
        });

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Establish session with output in normal buffer
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'first line: normal buffer output\r\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Disconnect while in normal buffer
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // Reconnect: handleReconnect should NOT emit alternate buffer exit (\x1b[?1049l)
      const writeSpy = vi.spyOn(XTerminal.prototype, 'write');
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Verify \x1b[?1049l was not emitted, but cursor/mouse escapes were
      expect(writeSpy.mock.calls.some(call => String(call[0]).includes('\x1b[?1049l'))).toBe(false);
      expect(
        writeSpy.mock.calls.some(call =>
          String(call[0]).includes('\x1b[?25h\x1b[?9l\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l')
        )
      ).toBe(true);
      writeSpy.mockRestore();

      // New exec output after reconnecting
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'second line: reconnected prompt\r\n'));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Both initial output and reconnected output remain in the terminal buffer without being overwritten
      expect(xtermInstance).not.toBeNull();
      const bufferText = Array.from({ length: xtermInstance.buffer.active.length }, (_, i) =>
        xtermInstance.buffer.active.getLine(i)?.translateToString(true)
      )
        .filter(Boolean)
        .join('\n');
      expect(bufferText).toContain('first line: normal buffer output');
      expect(bufferText).toContain('Connection closed.');
      expect(bufferText).toContain('second line: reconnected prompt');

      openSpy.mockRestore();
    });

    it('cycles to the fallback shell when reconnect receives a genuine missing-executable server error', async () => {
      const executedCommands: string[] = [];
      let failCallback: (() => void) | undefined;
      let onDataCallback: ((d: ArrayBuffer) => void) | undefined;

      const pod = createMockPod(
        async (
          _container: string,
          onData: (d: ArrayBuffer) => void,
          opts?: { command?: string[]; failCb?: () => void }
        ) => {
          const cmd = opts?.command?.[0];
          if (cmd) {
            executedCommands.push(cmd);
          }
          onDataCallback = onData;
          failCallback = opts?.failCb;
          return { cancel: () => {}, getSocket: () => null };
        }
      );

      render(
        <TestContext>
          <Terminal item={pod as any} open onClose={() => {}} />
        </TestContext>
      );

      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      expect(executedCommands).toEqual(['bash']);

      // 1. Establish session
      await act(async () => {
        onDataCallback?.(buildMessage(Channel.StdOut, 'user@pod:~$ '));
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // 2. Disconnect
      await act(async () => {
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      const reconnectButton = screen.getByRole('button', { name: 'Reconnect' });
      expect(reconnectButton).toBeEnabled();

      // 3. User clicks Reconnect
      fireEvent.click(reconnectButton);
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Attempted 'bash' for reconnect
      expect(executedCommands).toEqual(['bash', 'bash']);

      // 4. Server responds with a genuine missing-executable diagnostic
      await act(async () => {
        onDataCallback?.(
          buildMessage(
            Channel.ServerError,
            JSON.stringify({
              code: 500,
              status: 'Failure',
              reason: 'InternalError',
              message:
                'OCI runtime exec failed: exec failed: unable to start container process: exec: "bash": executable file not found in $PATH: unknown',
            })
          )
        );
        failCallback?.();
        vi.advanceTimersByTime(50);
      });
      await act(() => new Promise(res => process.nextTick(res)));

      // Must cycle to fallback shell '/bin/bash'
      expect(executedCommands).toEqual(['bash', 'bash', '/bin/bash']);
    });
  });
});
