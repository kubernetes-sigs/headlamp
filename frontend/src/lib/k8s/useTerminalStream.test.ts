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
import { useTerminalStream } from './useTerminalStream';

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options = {};
    cols = 80;
    rows = 24;
    writeln = vi.fn();
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

describe('useTerminalStream', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

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
});
