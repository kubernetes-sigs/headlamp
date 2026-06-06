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

  it('shows a warning and preserves user edits when the resource is modified externally', async () => {
    const initialItem = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'my-config', resourceVersion: '1' },
    };

    const { rerender } = render(
      <TestContext>
        <EditorDialog
          open
          keepMounted
          noDialog
          item={initialItem}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TestContext>
    );

    const editor = screen.getByRole('textbox', { name: /code$/i });

    // Simulate user making an edit
    fireEvent.change(editor, { target: { value: 'user-edited-content' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Re-render with updated resourceVersion simulating an external modification
    act(() => {
      rerender(
        <TestContext>
          <EditorDialog
            open
            keepMounted
            noDialog
            item={{
              apiVersion: 'v1',
              kind: 'ConfigMap',
              metadata: { name: 'my-config', resourceVersion: '2' },
            }}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        </TestContext>
      );
    });

    // Warning banner should be visible — assert on the specific warning text so the test fails
    // if a different alert (e.g. a YAML parse or apply error) is rendered instead.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This resource was modified while you were editing. Your changes may conflict with the latest version.'
      )
    ).toBeInTheDocument();

    // User's edit must be preserved — not overwritten with the new server content
    expect(screen.getByRole('textbox', { name: /code$/i })).toHaveValue('user-edited-content');
  });

  it('syncs to the new server content without warning when the resource changes and the user has no edits', () => {
    const initialItem = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'my-config', resourceVersion: '1' },
      data: { key1: 'value1' },
    };

    const { rerender } = render(
      <TestContext>
        <EditorDialog
          open
          keepMounted
          noDialog
          item={initialItem}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TestContext>
    );

    const editor = screen.getByRole('textbox', { name: /code$/i }) as HTMLTextAreaElement;
    expect(editor.value).toContain('value1');

    // Re-render with a newer resourceVersion and changed content, with no user edits.
    act(() => {
      rerender(
        <TestContext>
          <EditorDialog
            open
            keepMounted
            noDialog
            item={{
              apiVersion: 'v1',
              kind: 'ConfigMap',
              metadata: { name: 'my-config', resourceVersion: '2' },
              data: { key1: 'updated-value' },
            }}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        </TestContext>
      );
    });

    // No warning, because there were no unsaved edits to conflict with.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Editor synced to the new server content.
    const updatedEditor = screen.getByRole('textbox', { name: /code$/i }) as HTMLTextAreaElement;
    expect(updatedEditor.value).toContain('updated-value');
    expect(updatedEditor.value).not.toContain('value1');
  });

  it('clears the warning when the server-side change matches what the user already typed', () => {
    const initialItem = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'my-config', resourceVersion: '1' },
      data: { key1: 'value1' },
    };

    const { rerender } = render(
      <TestContext>
        <EditorDialog
          open
          keepMounted
          noDialog
          item={initialItem}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      </TestContext>
    );

    const newItem = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'my-config', resourceVersion: '2' },
      data: { key1: 'value1', key2: 'value2' },
    };

    // The user happens to type exactly the content the server will push next.
    const editor = screen.getByRole('textbox', { name: /code$/i });
    fireEvent.change(editor, { target: { value: JSON.stringify(newItem) } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Re-render under a new resourceVersion, with the same content the user already has.
    act(() => {
      rerender(
        <TestContext>
          <EditorDialog
            open
            keepMounted
            noDialog
            item={newItem}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        </TestContext>
      );
    });

    // No warning: once the baseline is rebased onto the latest version, the user's
    // content no longer differs from it, so there's nothing left to protect.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
