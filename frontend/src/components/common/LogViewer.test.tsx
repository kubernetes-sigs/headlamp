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

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SearchAddon } from '@xterm/addon-search';
import { Terminal as XTerminal } from '@xterm/xterm';
import type { MutableRefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { LogViewer, SearchPopover } from './LogViewer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      (key.split('|')[1] || key).replace(/{{\s*(\w+)\s*}}/g, (_, name) => String(values[name])),
  }),
}));

function makeSearchAddon() {
  // xterm emits this event synchronously from findNext, including for zero matches.
  type Results = { resultIndex: number; resultCount: number };
  const listeners = new Set<(results: Results) => void>();
  const addon = {
    findNext: vi.fn((term: string) => {
      const resultCount = term === 'Connection' ? 1 : 0;
      listeners.forEach(listener => listener({ resultIndex: resultCount ? 0 : -1, resultCount }));
      return resultCount > 0;
    }),
    onDidChangeResults: (listener: (results: Results) => void) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    clearDecorations: vi.fn(),
    clearActiveDecoration: vi.fn(),
  };
  return { ref: { current: addon as unknown as SearchAddon }, listeners };
}

describe('SearchPopover', () => {
  it('updates the match count as the query changes without requiring Enter', () => {
    const { ref } = makeSearchAddon();
    render(
      <TestContext>
        <SearchPopover open searchAddonRef={ref} onClose={() => {}} />
      </TestContext>
    );
    const input = screen.getByPlaceholderText('Find');
    fireEvent.change(input, { target: { value: 'Connection' } });
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'absent' } });
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.queryByText('1 of 1')).not.toBeInTheDocument();
  });

  it('keeps only one results listener and disposes it on unmount', () => {
    const { ref, listeners } = makeSearchAddon();
    const { unmount } = render(
      <TestContext>
        <SearchPopover open searchAddonRef={ref} onClose={() => {}} />
      </TestContext>
    );
    const input = screen.getByPlaceholderText('Find');
    for (const value of ['Connection', 'absent', 'Connection']) {
      fireEvent.change(input, { target: { value } });
      expect(listeners.size).toBe(1);
    }
    unmount();
    expect(listeners.size).toBe(0);
  });
});

describe('LogViewer context menu', () => {
  async function renderLogViewer() {
    const xtermRef: MutableRefObject<XTerminal | null> = { current: null };
    const result = render(
      <TestContext>
        <LogViewer
          noDialog
          open
          logs={['first log line\n']}
          onClose={() => {}}
          title="test"
          xtermRef={xtermRef}
        />
      </TestContext>
    );
    await waitFor(() => expect(xtermRef.current?.element).toBeTruthy());
    return { ...result, xtermRef, xtermElement: result.container.querySelector('.xterm')! };
  }

  it('does not open context menu without a selection', async () => {
    const { xtermElement } = await renderLogViewer();

    fireEvent.contextMenu(xtermElement);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('copies the selected text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { xtermRef, xtermElement } = await renderLogViewer();
    vi.spyOn(xtermRef.current!, 'hasSelection').mockReturnValue(true);
    vi.spyOn(xtermRef.current!, 'getSelection').mockReturnValue('first log line');

    fireEvent.contextMenu(xtermElement, { clientX: 10, clientY: 10 });
    fireEvent.click(await screen.findByRole('menuitem'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('first log line'));
  });
});
