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

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    open: vi.fn(),
    clear: vi.fn(),
    write: vi.fn(),
    focus: vi.fn(),
    onData: vi.fn(),
    onResize: vi.fn(),
    attachCustomKeyEventHandler: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    activate: vi.fn(),
  })),
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn().mockImplementation(() => ({
    activate: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    dispose: vi.fn(),
  })),
}));

const mockEnqueueSnackbar = vi.fn();
vi.mock('notistack', async importOriginal => {
  const actual = await importOriginal<typeof import('notistack')>();
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

describe('LogViewer', () => {
  const testLogs = ['line one\n', 'line two\n'];

  beforeEach(() => {
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
});
