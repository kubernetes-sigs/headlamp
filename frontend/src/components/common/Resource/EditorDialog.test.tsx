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
import EditorDialog, { EditorDialogProps, ViewDialog } from './EditorDialog';

const {
  mockApply,
  mockClusterAction,
  mockDispatchCreateEvent,
  mockGetCluster,
  mockLoadAll,
  mockSetModelMarkers,
  mockGetModel,
  mockTextarea,
  mockEditorInstance,
  mockOnChangeRef,
  MockYAMLException,
  capturedAction,
} = vi.hoisted(() => {
  const textarea = document.createElement('textarea');
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
    mockApply: vi.fn(),
    mockClusterAction: vi.fn((action: () => Promise<void>) => {
      capturedAction.current = action;
      return { type: 'clusterAction/test' };
    }),
    mockDispatchCreateEvent: vi.fn(),
    mockGetCluster: vi.fn(() => 'url-cluster'),
    mockLoadAll: vi.fn(),
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
        closest: () => null,
      }),
      getScrollTop: vi.fn(() => 123),
      getPosition: vi.fn(() => ({ lineNumber: 5, column: 10 })),
      setScrollTop: vi.fn(),
      setPosition: vi.fn(),
      addCommand: vi.fn(),
    },
    mockOnChangeRef: { current: undefined as ((value: string | undefined) => void) | undefined },
    MockYAMLException: YAMLException,
    capturedAction: { current: undefined as (() => Promise<void>) | undefined },
  };
});

vi.mock('js-yaml', () => {
  return {
    YAMLException: MockYAMLException,
    dump: vi.fn((value: unknown) => JSON.stringify(value, null, 2)),
    loadAll: mockLoadAll,
  };
});

vi.mock('../../../lib/cluster', () => ({
  getCluster: mockGetCluster,
}));

vi.mock('../../../lib/k8s/api/v1/apply', () => ({
  apply: mockApply,
}));

vi.mock('../../../redux/clusterActionSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../redux/clusterActionSlice')>()),
  clusterAction: mockClusterAction,
}));

vi.mock('../../../redux/headlampEventSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../redux/headlampEventSlice')>()),
  useEventCallback: () => mockDispatchCreateEvent,
}));

vi.mock('@monaco-editor/react', () => {
  return {
    Monaco: {} as any,
    Editor: ({ onChange, onMount }: any) => {
      mockOnChangeRef.current = onChange;

      React.useEffect(() => {
        onMount?.(
          { ...mockEditorInstance, getModel: mockGetModel },
          {
            editor: { setModelMarkers: mockSetModelMarkers },
            MarkerSeverity: { Error: 8 },
            KeyCode: { Escape: 9 },
          }
        );
      }, [onMount]);

      return (
        <div data-testid="mock-monaco-editor">
          <textarea aria-label="monaco-code" onChange={e => onChange?.(e.target.value)} />
        </div>
      );
    },
    DiffEditor: ({ modified, original }: any) => (
      <div data-testid="mock-diff-editor">
        {original}
        {modified}
      </div>
    ),
  };
});

vi.mock('./DocsViewer', () => ({
  default: ({ docSpecs }: any) => (
    <div data-testid="mock-docs-viewer">{JSON.stringify(docSpecs)}</div>
  ),
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
    capturedAction.current = undefined;
    mockApply.mockResolvedValue({});
    mockLoadAll.mockImplementation((value: string) => {
      if (value.includes('invalid')) {
        throw new MockYAMLException('Invalid YAML', { line: 2, column: 5 });
      }
      return [{ apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } }];
    });
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

  function renderEditorDialog(props: Partial<EditorDialogProps> = {}) {
    return render(
      <TestContext>
        <EditorDialog
          open
          keepMounted
          noDialog
          item={{ apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } }}
          onClose={vi.fn()}
          {...props}
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

  it('calls onBaselineAccepted with the latest server version when Undo discards a conflicting edit', () => {
    const onBaselineAccepted = vi.fn();
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
          onBaselineAccepted={onBaselineAccepted}
        />
      </TestContext>
    );

    const editor = screen.getByRole('textbox', { name: /code$/i });
    fireEvent.change(editor, { target: { value: 'user-edited-content' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    const externallyModifiedItem = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'my-config', resourceVersion: '2' },
    };

    // Re-render with updated resourceVersion simulating an external modification.
    act(() => {
      rerender(
        <TestContext>
          <EditorDialog
            open
            keepMounted
            noDialog
            item={externallyModifiedItem}
            onClose={vi.fn()}
            onSave={vi.fn()}
            onBaselineAccepted={onBaselineAccepted}
          />
        </TestContext>
      );
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Not yet — the user's edits are still being preserved, nothing has been accepted.
    expect(onBaselineAccepted).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    // Undo discards the user's edit in favour of the latest server version — the
    // save-baseline owner must rebase onto that same version, not the stale one it
    // launched with, so a subsequent edit + save doesn't replay the external change.
    expect(onBaselineAccepted).toHaveBeenCalledTimes(1);
    expect(onBaselineAccepted).toHaveBeenCalledWith(externallyModifiedItem);

    // A second Undo click (e.g. on a fresh unrelated edit) must not re-fire it.
    fireEvent.change(screen.getByRole('textbox', { name: /code$/i }), {
      target: { value: 'another-edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect(onBaselineAccepted).toHaveBeenCalledTimes(1);
  });

  it('does not call onBaselineAccepted when Undo discards a plain edit with no external conflict', () => {
    const onBaselineAccepted = vi.fn();
    renderEditorDialog({ onSave: vi.fn(), onBaselineAccepted });

    const editor = screen.getByRole('textbox', { name: /code$/i });
    fireEvent.change(editor, { target: { value: 'just my own edit, no conflict involved' } });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    fireEvent.click(screen.getByRole('button', { name: /undo/i }));

    expect(onBaselineAccepted).not.toHaveBeenCalled();
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

  it('configures the dialog content to scroll with a minimum height', () => {
    renderEditorDialog();

    const dialogContent = document.querySelector('.MuiDialogContent-root');
    expect(dialogContent).toHaveStyle({ minHeight: '400px', overflowY: 'auto' });
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

  it('registers an Escape command with the correct precondition to exit the Monaco editor', () => {
    localStorage.setItem('useSimpleEditor', 'false');

    renderEditorDialog();

    expect(mockEditorInstance.addCommand).toHaveBeenCalledWith(
      9, // KeyCode.Escape from the mock
      expect.any(Function),
      '!suggestWidgetVisible && !findWidgetVisible && !renameInputVisible && !parameterHintsVisible && !inSnippetMode && !editorHasMultipleSelections'
    );
  });

  it('renders loading, empty, and closed states', () => {
    const { rerender } = renderEditorDialog({ item: null });
    expect(screen.getByRole('progressbar', { name: /loading editor/i })).toBeInTheDocument();

    rerender(
      <TestContext>
        <EditorDialog open keepMounted noDialog item={{}} onClose={vi.fn()} />
      </TestContext>
    );
    expect(screen.getByRole('textbox', { name: /code/i })).toHaveValue(
      '# Enter your YAML or JSON here'
    );

    rerender(
      <TestContext>
        <EditorDialog open={false} item={{}} onClose={vi.fn()} />
      </TestContext>
    );
    expect(screen.queryByRole('textbox', { name: /code/i })).not.toBeInTheDocument();
  });

  it('renders a read-only view without edit tabs or actions', () => {
    render(
      <TestContext>
        <ViewDialog
          open
          keepMounted
          noDialog
          item={{ apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } }}
          onClose={vi.fn()}
        />
      </TestContext>
    );

    expect(screen.getByRole('textbox', { name: /code/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dry run/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save & apply/i })).not.toBeInTheDocument();
  });

  it.each([
    [
      'object',
      '{"kind":"Pod","metadata":{"name":"pod-1"}}',
      [{ kind: 'Pod', metadata: { name: 'pod-1' } }],
    ],
    ['array', '[{"kind":"Pod"},{"kind":"Service"}]', [{ kind: 'Pod' }, { kind: 'Service' }]],
  ])('saves a JSON %s through a custom callback', (_type, value, expected) => {
    const onSave = vi.fn();
    const onEditorChanged = vi.fn();
    renderEditorDialog({ onSave, onEditorChanged, saveLabel: 'Apply Object' });

    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Object' }));

    expect(onEditorChanged).toHaveBeenCalledWith(value);
    expect(onSave).toHaveBeenCalledWith(expected);
  });

  it('renders optional content and initializes documentation and diff tabs', () => {
    renderEditorDialog({
      actions: [<Button key="action">Extra action</Button>],
      toolbarActions: [<Button key="toolbar">Toolbar action</Button>],
      formContent: <div>Form content</div>,
    });

    expect(screen.getByRole('button', { name: 'Extra action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Toolbar action' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Form' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Documentation' }));
    expect(screen.getByTestId('mock-docs-viewer')).toHaveTextContent('node-1');

    expect(screen.queryByTestId('mock-diff-editor')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }));
    expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
  });

  it('initializes documentation and diff tabs without form content', () => {
    renderEditorDialog();

    fireEvent.click(screen.getByRole('tab', { name: 'Documentation' }));
    expect(screen.getByTestId('mock-docs-viewer')).toHaveTextContent('node-1');

    fireEvent.click(screen.getByRole('tab', { name: 'Review Changes' }));
    expect(screen.getByTestId('mock-diff-editor')).toBeInTheDocument();
  });

  it('renders string input and an external error', () => {
    renderEditorDialog({
      item: 'kind: Pod',
      errorMessage: 'External error',
      title: 'Custom title',
    });

    expect(screen.getByRole('textbox', { name: /code/i })).toHaveValue('"kind: Pod"');
    expect(screen.getByText('External error')).toBeInTheDocument();
  });

  it('toggles managed fields in the editor', () => {
    renderEditorDialog({
      allowToHideManagedFields: true,
      item: {
        apiVersion: 'v1',
        kind: 'Node',
        metadata: {
          name: 'node-1',
          managedFields: [{ manager: 'test' }],
        },
      },
    });

    const editor = screen.getByRole('textbox', { name: /code/i });
    expect(editor).not.toHaveValue(expect.stringContaining('managedFields'));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide Managed Fields' }));
    expect((editor as HTMLTextAreaElement).value).toContain('managedFields');
  });

  it.each([
    ['the URL cluster', {}, 'url-cluster'],
    [
      'the item cluster',
      { item: { kind: 'Node', metadata: { name: 'node-1' }, cluster: 'item-cluster' } },
      'item-cluster',
    ],
    ['the explicit cluster', { cluster: 'explicit-cluster' }, 'explicit-cluster'],
  ])('runs a dry run against %s', async (_description, props, expectedCluster) => {
    renderEditorDialog(props);
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value: 'valid yaml' },
    });
    fireEvent.click(screen.getByRole('button', { name: /dry run/i }));

    expect(mockClusterAction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        startMessage: expect.stringContaining('Running dry run'),
        successMessage: expect.stringContaining('Dry run passed'),
      })
    );

    await act(async () => capturedAction.current?.());
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Node' }),
      expectedCluster,
      { dryRun: true }
    );
  });

  it('applies valid YAML and records the create event', async () => {
    const onClose = vi.fn();
    renderEditorDialog({ onClose });
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value: 'valid yaml' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & apply/i }));

    expect(mockDispatchCreateEvent).toHaveBeenCalledWith({ status: 'confirmed' });
    await act(async () => capturedAction.current?.());
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'Node' }),
      'url-cluster',
      undefined
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('uses fallback resource labels and an empty cluster for dry runs', async () => {
    mockLoadAll.mockReturnValueOnce([
      { apiVersion: 'v1', kind: 'Node', metadata: {} },
      { apiVersion: 'v1', metadata: {} },
    ]);
    mockGetCluster.mockReturnValueOnce('');
    renderEditorDialog();
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value: 'unnamed resources' },
    });
    fireEvent.click(screen.getByRole('button', { name: /dry run/i }));

    expect(mockClusterAction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ startMessage: expect.stringContaining('Node,resource') })
    );
    await act(async () => capturedAction.current?.());
    expect(mockApply).toHaveBeenCalledWith(expect.any(Object), '', { dryRun: true });
  });

  it('shows an apply error and reopens the dialog', async () => {
    const setOpen = vi.fn();
    mockApply.mockRejectedValueOnce(new Error('API unavailable'));
    renderEditorDialog({ setOpen });
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value: 'valid yaml' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & apply/i }));

    await act(async () => {
      await expect(capturedAction.current?.()).rejects.toThrow('Failed to create Node node-1.');
    });
    expect(screen.getByText('API unavailable')).toBeInTheDocument();
    expect(setOpen).toHaveBeenCalledWith(true);
  });

  it('reports individual failures when applying multiple resources', async () => {
    mockLoadAll.mockReturnValueOnce([
      { apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-1' } },
      { apiVersion: 'v1', kind: 'Node', metadata: { name: 'node-2' } },
    ]);
    mockApply.mockRejectedValueOnce({}).mockResolvedValueOnce({});
    renderEditorDialog();
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value: 'multiple resources' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save & apply/i }));

    await act(async () => {
      await expect(capturedAction.current?.()).rejects.toThrow(
        'Failed to create Node node-1 in v1.'
      );
    });
    expect(screen.getByText('Failed to create Node node-1 in v1.')).toBeInTheDocument();
  });

  it('disables form actions when validation fails and opens the upload dialog', () => {
    renderEditorDialog({ formContent: <div>Form content</div>, formInvalid: true });
    fireEvent.change(screen.getByRole('textbox', { name: /code/i }), {
      target: { value: 'valid yaml' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Form' }));

    expect(screen.getByRole('button', { name: /dry run/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save & apply/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /upload file\/url/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
