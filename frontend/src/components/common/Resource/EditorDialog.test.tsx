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

import Button from '@mui/material/Button';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../../test';
import EditorDialog from './EditorDialog';

vi.mock('js-yaml', () => ({
  dump: vi.fn((value: unknown) => JSON.stringify(value, null, 2)),
  loadAll: vi.fn((value: string) => {
    if (value.includes('invalid')) {
      throw new Error('Invalid YAML');
    }

    return [{ apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } }];
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  Editor: () => null,
  DiffEditor: () => null,
}));

vi.mock('./DocsViewer', () => ({
  default: () => null,
}));

vi.mock('../ConfirmButton', () => ({
  default: ({
    children,
    onConfirm,
    disabled,
    ariaLabel,
  }: {
    children: React.ReactNode;
    onConfirm: () => void;
    disabled?: boolean;
    ariaLabel?: string;
  }) => (
    <Button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onConfirm();
        }
      }}
    >
      {children}
    </Button>
  ),
}));

describe('EditorDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('useSimpleEditor', 'true');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  function renderEditorDialog() {
    render(
      <TestContext>
        <EditorDialog
          open
          keepMounted
          noDialog
          item={{ apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } }}
          onClose={vi.fn()}
        />
      </TestContext>
    );
  }

  it('clears parse errors after undo restores the original content', () => {
    renderEditorDialog();

    const editor = screen.getByRole('textbox', { name: /code$/i });
    fireEvent.change(editor, { target: { value: 'invalid' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByText('Invalid YAML')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /undo changes/i }));

    expect(screen.queryByText('Invalid YAML')).not.toBeInTheDocument();
  });

  it('cancels pending validation when undo restores the original content', () => {
    renderEditorDialog();

    const editor = screen.getByRole('textbox', { name: /code$/i });
    fireEvent.change(editor, { target: { value: 'invalid' } });

    fireEvent.click(screen.getByRole('button', { name: /undo changes/i }));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText('Invalid YAML')).not.toBeInTheDocument();
  });
});
