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
} as const;

function buildMessage(channel: number, text: string): ArrayBuffer {
  const encoded = encoder.encode(text);
  const buffer = new Uint8Array([channel, ...encoded]);
  return buffer.buffer;
}

/** Minimal pod-shaped mock for Terminal (no Pod import to avoid k8s chain in isolation). */
function createMockPod(
  exec: (c: string, onData: (d: ArrayBuffer) => void) => Promise<unknown>,
  attach: (c: string, onData: (d: ArrayBuffer) => void) => Promise<unknown> = exec
) {
  return {
    metadata: { name: 'mock-pod' },
    spec: {
      nodeSelector: { 'kubernetes.io/os': 'linux' },
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
});
