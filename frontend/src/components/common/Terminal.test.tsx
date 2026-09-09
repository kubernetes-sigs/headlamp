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
function createMockPod(exec: (c: string, onData: (d: ArrayBuffer) => void) => Promise<unknown>) {
  return {
    metadata: { name: 'mock-pod' },
    spec: {
      nodeSelector: { 'kubernetes.io/os': 'linux' },
      containers: [{ name: 'main' }],
      initContainers: [],
      ephemeralContainers: [],
    },
    exec,
    attach: exec,
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
    const streamReturn = {
      cancel: () => {},
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

    await act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(true).toBe(true);
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
    });

    it('shows the context menu with Copy and Paste on right click', async () => {
      await renderTerminal({ readyState: 1, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);

      expect(screen.getByRole('menuitem', { name: 'translation|Copy' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'translation|Paste' })).toBeInTheDocument();
    });

    it('disables Paste when the socket is not ready', async () => {
      await renderTerminal({ readyState: 0, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);

      expect(screen.getByRole('menuitem', { name: 'translation|Paste' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    });

    it('disables Copy when there is no selection', async () => {
      getSelectionSpy = vi.spyOn(XTerminal.prototype, 'getSelection').mockReturnValue('');
      await renderTerminal({ readyState: 1, send: () => {} });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);

      expect(screen.getByRole('menuitem', { name: 'translation|Copy' })).toHaveAttribute(
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
      fireEvent.click(screen.getByRole('menuitem', { name: 'translation|Copy' }));
      await act(() => new Promise(res => process.nextTick(res)));

      expect(writeText).toHaveBeenCalledWith('selected text');
    });

    it('sends pasted clipboard text over the socket on stdin channel 0', async () => {
      const send = vi.fn();
      const readText = vi.fn().mockResolvedValue('pasted text');
      Object.assign(navigator, { clipboard: { readText } });

      await renderTerminal({ readyState: 1, send });

      fireEvent.contextMenu(document.getElementById('xterm-container')!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'translation|Paste' }));
      await act(() => new Promise(res => process.nextTick(res)));

      expect(readText).toHaveBeenCalled();
      expect(send).toHaveBeenCalled();
      const sentBuffer = send.mock.calls[0][0] as ArrayBuffer;
      const sentBytes = new Uint8Array(sentBuffer);
      expect(sentBytes[0]).toBe(0);
      expect(new TextDecoder().decode(sentBytes.slice(1))).toBe('pasted text');
    });
  });
});
