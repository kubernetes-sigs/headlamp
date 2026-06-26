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

const { mockSetModelMarkers, mockGetModel, mockTextarea, mockEditorInstance, mockOnChangeRef } =
  vi.hoisted(() => {
    const textarea = document.createElement('textarea');
    return {
      mockSetModelMarkers: vi.fn(),
      mockGetModel: vi.fn(() => ({})),
      mockTextarea: textarea,
      mockEditorInstance: {
        getDomNode: () => ({
          querySelector: (selector: string) => {
            if (selector === 'textarea') {
              return textarea;
            }
            return null;
          },
        }),
        getScrollTop: vi.fn(() => 123),
        getPosition: vi.fn(() => ({ lineNumber: 5, column: 10 })),
        setScrollTop: vi.fn(),
        setPosition: vi.fn(),
      },
      mockOnChangeRef: { current: undefined as ((value: string | undefined) => void) | undefined },
    };
  });

vi.mock('js-yaml', () => {
  class YAMLException extends Error {
    reason: string;
    mark: any;
    constructor(reason: string, mark: any) {
      super(reason);
      this.name = 'YAMLException';
      this.reason = reason;
      this.mark = mark;
    }
  }

  return {
    YAMLException,
    dump: vi.fn((value: unknown) => JSON.stringify(value, null, 2)),
    loadAll: vi.fn((value: string) => {
      if (value.includes('invalid')) {
        throw new YAMLException('Invalid YAML', { line: 2, column: 5 });
      }
      return [{ apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } }];
    }),
  };
});

vi.mock('@monaco-editor/react', () => {
  return {
    Monaco: {} as any,
    Editor: ({ onChange, onMount }: any) => {
      mockOnChangeRef.current = onChange;

      React.useEffect(() => {
        onMount?.(
          { ...mockEditorInstance, getModel: mockGetModel },
          { editor: { setModelMarkers: mockSetModelMarkers }, MarkerSeverity: { Error: 8 } }
        );
      }, [onMount]);

      return (
        <div data-testid="mock-monaco-editor">
          <textarea aria-label="monaco-code" onChange={e => onChange?.(e.target.value)} />
        </div>
      );
    },
    DiffEditor: () => null,
  };
});

vi.mock('./DocsViewer', () => ({
  default: () => null,
}));

vi.mock('../ConfirmButton', () => ({
  default: ({
    children,
    onConfirm,
    disabled,
    'aria-label': ariaLabel,
    'aria-controls': ariaControls,
  }: {
    children: React.ReactNode;
    onConfirm: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    'aria-controls'?: string;
  }) => (
    <Button
      aria-label={ariaLabel}
      disabled={disabled}
      aria-controls={ariaControls}
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
    mockTextarea.id = '';
    // jsdom doesn't implement requestAnimationFrame; run callbacks
    // synchronously so the scroll/cursor restore is deterministic in tests.
    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    expect(screen.queryByText('Invalid YAML')).not.toBeInTheDocument();
  });

  it('cancels pending validation when undo restores the original content', () => {
    renderEditorDialog();

    const editor = screen.getByRole('textbox', { name: /code$/i });
    fireEvent.change(editor, { target: { value: 'invalid' } });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByText('Invalid YAML')).not.toBeInTheDocument();
  });

  it('sets model markers on invalid YAML and clears them on valid YAML in monaco editor', () => {
    localStorage.setItem('useSimpleEditor', 'false'); // Use monaco
    renderEditorDialog();

    const editor = screen.getByRole('textbox', { name: /monaco-code/i });

    // Simulate invalid yaml
    fireEvent.change(editor, { target: { value: 'invalid' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockSetModelMarkers).toHaveBeenCalledWith(expect.any(Object), 'headlamp-yaml-parse', [
      {
        startLineNumber: 3,
        startColumn: 6,
        endLineNumber: 3,
        endColumn: 7,
        message: 'Invalid YAML',
        severity: 8,
      },
    ]);

    // Simulate valid yaml
    fireEvent.change(editor, { target: { value: 'valid' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockSetModelMarkers).toHaveBeenCalledWith(expect.any(Object), 'headlamp-yaml-parse', []);

    // Ensure Undo also clears markers
    fireEvent.change(editor, { target: { value: 'invalid' } });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(mockSetModelMarkers).toHaveBeenLastCalledWith(
      expect.any(Object),
      'headlamp-yaml-parse',
      []
    );
  });

  it('renders the editor textarea and action buttons with correct id and aria-controls attributes', () => {
    renderEditorDialog();

    const textarea = screen.getByRole('textbox', { name: /code/i });
    expect(textarea.id).toMatch(/^editor-textarea-/);

    const textareaId = textarea.id;

    // Under test render, ConfirmButton has aria-label="Undo" which overrides "Undo Changes" as the accessible name
    const undoButton = screen.getByRole('button', { name: /undo/i });
    expect(undoButton).toHaveAttribute('aria-controls', textareaId);

    const dryRunButton = screen.getByRole('button', { name: /dry run/i });
    expect(dryRunButton).toHaveAttribute('aria-controls', textareaId);

    const saveApplyButton = screen.getByRole('button', { name: /save & apply/i });
    expect(saveApplyButton).toHaveAttribute('aria-controls', textareaId);
  });

  it('correctly sets textarea ID and aria-controls attributes when using Monaco editor onMount', () => {
    localStorage.setItem('useSimpleEditor', 'false');

    renderEditorDialog();

    expect(mockTextarea.id).toMatch(/^editor-textarea-/);

    const textareaId = mockTextarea.id;

    expect(screen.getByRole('button', { name: /undo/i })).toHaveAttribute(
      'aria-controls',
      textareaId
    );

    expect(screen.getByRole('button', { name: /dry run/i })).toHaveAttribute(
      'aria-controls',
      textareaId
    );

    expect(screen.getByRole('button', { name: /save & apply/i })).toHaveAttribute(
      'aria-controls',
      textareaId
    );
  });

  it('restores Monaco scroll position and cursor after validation produces an error', () => {
    localStorage.setItem('useSimpleEditor', 'false');

    renderEditorDialog();

    act(() => {
      mockOnChangeRef.current?.('invalid');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockEditorInstance.setScrollTop).toHaveBeenCalledWith(123);
    expect(mockEditorInstance.setPosition).toHaveBeenCalledWith({ lineNumber: 5, column: 10 });
  });

  it('does not touch scroll/cursor when validation finds nothing to update', () => {
    localStorage.setItem('useSimpleEditor', 'false');

    renderEditorDialog();

    // The dialog's mount effect re-detects the mocked (JSON-shaped) initial
    // content as format 'json'. Valid JSON without "invalid" in it keeps
    // both format ('json') and error ('') unchanged, so there's nothing for
    // the validation tick to restore.
    act(() => {
      mockOnChangeRef.current?.('{"apiVersion":"v1","kind":"Node"}');
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mockEditorInstance.setScrollTop).not.toHaveBeenCalled();
    expect(mockEditorInstance.setPosition).not.toHaveBeenCalled();
  });
});
