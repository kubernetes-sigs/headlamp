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
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { LogViewer, SearchPopover } from './LogViewer';

const { mockEnqueueSnackbar, terminalInstances, fitAddonInstances, searchAddonInstances } =
  vi.hoisted(() => ({
    mockEnqueueSnackbar: vi.fn(),
    terminalInstances: [] as any[],
    fitAddonInstances: [] as any[],
    searchAddonInstances: [] as any[],
  }));

vi.mock('notistack', async importOriginal => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    options: Record<string, any>;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    clear = vi.fn();
    dispose = vi.fn();
    getSelection = vi.fn(() => '');
    private keyHandler: ((arg: any) => boolean) | null = null;
    attachCustomKeyEventHandler = vi.fn((fn: (arg: any) => boolean) => {
      this.keyHandler = fn;
    });
    triggerKeyEvent(arg: any) {
      return this.keyHandler?.(arg);
    }
    buffer = {
      active: {
        baseY: 0,
        cursorY: 1,
        length: 3,
        getLine: (idx: number) => {
          const rows: Record<number, { text: string; isWrapped?: boolean }> = {
            0: { text: 'first line  ', isWrapped: false },
            1: { text: 'second line', isWrapped: false },
            2: { text: '', isWrapped: false },
          };
          const row = rows[idx];
          if (!row) return undefined;
          return {
            isWrapped: Boolean(row.isWrapped),
            translateToString: (trimRight: boolean) => (trimRight ? row.text.trimEnd() : row.text),
          };
        },
      },
    };
    constructor(opts: Record<string, any>) {
      this.options = opts;
      terminalInstances.push(this);
    }
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    fit = vi.fn();
    constructor() {
      fitAddonInstances.push(this);
    }
  }
  return { FitAddon: MockFitAddon };
});

vi.mock('@xterm/addon-search', () => {
  class MockSearchAddon {
    findNext = vi.fn();
    findPrevious = vi.fn();
    clearDecorations = vi.fn();
    clearActiveDecoration = vi.fn();
    dispose = vi.fn();
    onDidChangeResults = vi.fn(() => ({ dispose: vi.fn() }));
    constructor() {
      searchAddonInstances.push(this);
    }
  }
  return { SearchAddon: MockSearchAddon };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values: Record<string, unknown> = {}) =>
      (key.split('|')[1] || key).replace(/{{\s*(\w+)\s*}}/g, (_, name) => String(values[name])),
  }),
}));

function makeSearchAddon() {
  type Results = { resultIndex: number; resultCount: number };
  const listeners = new Set<(results: Results) => void>();
  const addon = {
    // xterm emits this event synchronously from findNext, including for zero matches.
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

  it('supports Enter, Shift+Enter, option toggles, invalid regex, and close', () => {
    const { ref } = makeSearchAddon();
    const onClose = vi.fn();
    const addon = ref.current as any;
    addon.findPrevious = vi.fn();
    addon.findNext.mockImplementation((term: string, opts?: any) => {
      if (opts?.regex && term === '[invalid') {
        throw new Error('Invalid regex');
      }
      return false;
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <TestContext>
        <SearchPopover open searchAddonRef={ref} onClose={onClose} />
      </TestContext>
    );

    const input = screen.getByPlaceholderText('Find');
    fireEvent.change(input, { target: { value: 'hello' } });
    addon.findNext.mockClear();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(addon.findNext).toHaveBeenCalledTimes(1);
    expect(addon.findNext).toHaveBeenCalledWith('hello', expect.any(Object));

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(addon.findPrevious).toHaveBeenCalledWith('hello', expect.any(Object));

    // Toggle Match case, Match whole word, Use regular expression
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
    fireEvent.click(screen.getByRole('button', { name: 'Match whole word' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }));

    // Trigger invalid regex catch branch
    fireEvent.change(input, { target: { value: '[invalid' } });
    expect(errorSpy).toHaveBeenCalledWith('Error searching logs: ', expect.any(Error));
    expect(addon.findNext).toHaveBeenCalledWith('');

    // Close button
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('shows Too many matches when searchText is non-empty and searchResult is undefined', () => {
    const addon = {
      findNext: vi.fn(),
      onDidChangeResults: vi.fn(() => ({ dispose: vi.fn() })),
      clearDecorations: vi.fn(),
      clearActiveDecoration: vi.fn(),
    };
    render(
      <TestContext>
        <SearchPopover
          open
          searchAddonRef={{ current: addon as unknown as SearchAddon }}
          onClose={() => {}}
        />
      </TestContext>
    );

    fireEvent.change(screen.getByPlaceholderText('Find'), { target: { value: 'a' } });
    expect(screen.getByText('Too many matches')).toBeInTheDocument();
  });
});

describe('LogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalInstances.length = 0;
    fitAddonInstances.length = 0;
    searchAddonInstances.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders logs in noDialog mode, updates logs, and cleans up on unmount', () => {
    const { rerender, unmount } = render(
      <TestContext>
        <LogViewer
          open
          noDialog
          logs={['line 1\n', 'line 2\n']}
          onClose={vi.fn()}
          topActions={[<span key="custom">Top Action</span>]}
        />
      </TestContext>
    );

    expect(screen.getByText('Top Action')).toBeInTheDocument();
    const term = terminalInstances[0];
    expect(term.open).toHaveBeenCalled();
    expect(fitAddonInstances[0].fit).toHaveBeenCalled();
    expect(term.write).toHaveBeenCalledWith('line 1\r\nline 2\r\n');

    // Window resize triggers fit
    fireEvent(window, new Event('resize'));
    expect(fitAddonInstances[0].fit).toHaveBeenCalledTimes(2);

    // Updating logs updates the terminal output
    rerender(
      <TestContext>
        <LogViewer open noDialog logs={['line 3\n']} onClose={vi.fn()} />
      </TestContext>
    );
    expect(terminalInstances).toHaveLength(1);
    expect(term.clear).toHaveBeenCalled();
    expect(term.write).toHaveBeenCalledWith('line 3\r\n');

    // Custom key event handler for Ctrl+C / Ctrl+V
    term.getSelection.mockReturnValueOnce('selected');
    expect(term.triggerKeyEvent({ ctrlKey: true, code: 'KeyC', type: 'keydown' })).toBe(false);
    term.getSelection.mockReturnValueOnce('');
    expect(term.triggerKeyEvent({ ctrlKey: true, code: 'KeyC', type: 'keydown' })).toBe(true);
    expect(term.triggerKeyEvent({ ctrlKey: true, code: 'KeyV', type: 'keydown' })).toBe(false);

    unmount();
    expect(term.dispose).toHaveBeenCalled();
  });

  it('handles Clear, Find, Reconnect, Download, and Copy to clipboard actions', async () => {
    const onReconnect = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    render(
      <TestContext>
        <LogViewer
          open
          noDialog
          logs={['hello\n']}
          onClose={vi.fn()}
          showReconnectButton
          handleReconnect={onReconnect}
          downloadName="pod-logs"
        />
      </TestContext>
    );

    // Reconnect
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalled();

    // Clear
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(terminalInstances[0].clear).toHaveBeenCalled();

    // Download
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    // Copy success
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('first line\nsecond line');
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('Copied to clipboard', {
        variant: 'success',
      });
    });

    // Find toggles SearchPopover
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    expect(screen.getByPlaceholderText('Find')).toBeInTheDocument();
  });

  it('shows error snackbar when clipboard is unavailable or writeText fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });

    const { rerender } = render(
      <TestContext>
        <LogViewer open noDialog logs={['hello']} onClose={vi.fn()} />
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
        expect.stringContaining('Clipboard is not available'),
        { variant: 'error' }
      );
    });

    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    rerender(
      <TestContext>
        <LogViewer open noDialog logs={['hello']} onClose={vi.fn()} />
      </TestContext>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }));
    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('Failed to copy to clipboard', {
        variant: 'error',
      });
    });

    errorSpy.mockRestore();
  });

  it('renders inside Dialog and exposes external xtermRef without overwriting logs', () => {
    const externalRef = React.createRef<any>() as React.MutableRefObject<any>;
    const { rerender } = render(
      <TestContext>
        <LogViewer
          open
          title="Pod Logs"
          logs={['initial']}
          xtermRef={externalRef}
          onClose={vi.fn()}
        />
      </TestContext>
    );

    expect(screen.getByText('Pod Logs')).toBeInTheDocument();
    expect(externalRef.current).toBe(terminalInstances[0]);

    const callsAfterMount = terminalInstances[0].write.mock.calls.length;
    rerender(
      <TestContext>
        <LogViewer
          open
          title="Pod Logs"
          logs={['updated']}
          xtermRef={externalRef}
          onClose={vi.fn()}
        />
      </TestContext>
    );
    expect(terminalInstances).toHaveLength(1);
    expect(externalRef.current).toBe(terminalInstances[0]);
    expect(externalRef.current.write).toHaveBeenCalledTimes(callsAfterMount);
  });
});
