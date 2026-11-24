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

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TestContext } from '../../test';
import { LogViewer } from './LogViewer';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Fake xterm buffer; tests set `active` to exercise the buffer-backed copy path.
const mockBuffer = vi.hoisted(() => ({
  active: undefined as
    | undefined
    | {
        baseY: number;
        cursorY: number;
        length: number;
        getLine: (i: number) => {
          isWrapped: boolean;
          translateToString: (trimRight?: boolean) => string;
        };
      },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(function () {
    return {
      buffer: mockBuffer,
      open: vi.fn(),
      clear: vi.fn(),
      write: vi.fn(),
      focus: vi.fn(),
      onData: vi.fn(),
      onResize: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(function () {
    return {
      fit: vi.fn(),
      activate: vi.fn(),
    };
  }),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn().mockImplementation(function () {
    return {
      activate: vi.fn(),
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

const mockEnqueueSnackbar = vi.fn();
vi.mock('notistack', async importOriginal => {
  const actual = await importOriginal<typeof import('notistack')>();
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

describe('LogViewer copy action', () => {
  const testLogs = ['line one\n', 'line two\n'];

  beforeEach(() => {
    mockBuffer.active = undefined;
    mockEnqueueSnackbar.mockClear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('copies logs to the clipboard and shows a success message', async () => {
    render(
      <TestContext>
        <LogViewer open logs={testLogs} title="test-pod" onClose={() => {}} noDialog />
      </TestContext>
    );

    const copyButton = screen.getByRole('button', { name: 'translation|Copy to clipboard' });

    await userEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testLogs.join(''));
    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.stringMatching(/copied/i),
      expect.objectContaining({ variant: 'success' })
    );
  });

  it('shows an error message if the clipboard write fails', async () => {
    (navigator.clipboard.writeText as any).mockRejectedValueOnce(new Error('denied'));

    render(
      <TestContext>
        <LogViewer open logs={testLogs} title="test-pod" onClose={() => {}} noDialog />
      </TestContext>
    );

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    await userEvent.click(copyButton);

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.stringMatching(/failed/i),
      expect.objectContaining({ variant: 'error' })
    );
  });

  it('shows a distinct error message when the clipboard API is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined });

    render(
      <TestContext>
        <LogViewer open logs={testLogs} title="test-pod" onClose={() => {}} noDialog />
      </TestContext>
    );

    const copyButton = screen.getByRole('button', { name: /copy to clipboard/i });
    await userEvent.click(copyButton);

    expect(mockEnqueueSnackbar).toHaveBeenCalledWith(
      expect.stringMatching(/clipboard is not available/i),
      expect.objectContaining({ variant: 'error' })
    );
  });

  describe('when copying from the terminal buffer', () => {
    // Rows past the written ones stand in for the unused part of the viewport.
    // translateToString honors trimRight like xterm does, so whitespace handling is exercised.
    function setRows(rows: { text: string; isWrapped?: boolean }[], cursorY: number) {
      const viewportRows = 30;
      mockBuffer.active = {
        baseY: 0,
        cursorY,
        length: viewportRows,
        getLine: i => ({
          isWrapped: rows[i]?.isWrapped ?? false,
          translateToString: (trimRight = false) => {
            const text = rows[i]?.text ?? '';
            return trimRight ? text.trimEnd() : text;
          },
        }),
      };
    }

    async function copy() {
      render(
        <TestContext>
          <LogViewer open logs={testLogs} title="test-pod" onClose={() => {}} noDialog />
        </TestContext>
      );
      await userEvent.click(screen.getByRole('button', { name: /copy to clipboard/i }));
    }

    it('joins wrapped rows into one line and ignores the unused viewport', async () => {
      setRows(
        [{ text: 'a very long ' }, { text: 'wrapped line', isWrapped: true }, { text: 'next' }],
        2
      );

      await copy();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a very long wrapped line\nnext');
    });

    it('keeps the space at a wrapped row boundary but trims the last row', async () => {
      setRows([{ text: 'word ' }, { text: 'wrapped   ', isWrapped: true }, { text: 'next   ' }], 2);

      await copy();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('word wrapped\nnext');
    });

    it('includes populated rows below the cursor', async () => {
      // e.g. "first\nsecond" followed by a cursor-up escape leaves the cursor on row 0.
      setRows([{ text: 'first' }, { text: 'second' }], 0);

      await copy();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('first\nsecond');
    });

    it('keeps the final newline when the cursor sits on an empty row', async () => {
      setRows([{ text: 'first' }, { text: 'second' }, { text: '' }], 2);

      await copy();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('first\nsecond\n');
    });
  });
});
