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

import '../../../i18n/config';
import Editor from '@monaco-editor/react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { t } from 'i18next';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { getCluster } from '../../../lib/cluster';
import { apply } from '../../../lib/k8s/api/v1/apply';
import { KUBE_OBJECT_BRAND, KubeObject, KubeObjectInterface } from '../../../lib/k8s/KubeObject';
import { isNullable, useId } from '../../../lib/util';
import { clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import { useCurrentAppTheme } from '../../App/themeSlice';
import { useLocalStorageState } from '../../globalSearch/useLocalStorageState';
import ConfirmButton from '../ConfirmButton';
import { Dialog, DialogProps } from '../Dialog';
import Empty from '../EmptyContent';
import Loader from '../Loader';
import Tabs from '../Tabs';
import DocsViewer from './DocsViewer';
import SimpleEditor from './SimpleEditor';
import { UploadDialog } from './UploadDialog';

type KubeObjectIsh = Partial<KubeObjectInterface>;

type Path = Array<string | number>;
type PathOp =
  | { type: 'set'; path: Path; baseValue: unknown; value: unknown }
  | { type: 'delete'; path: Path; baseValue: unknown };

type HighlightRequest = {
  previousCode: string;
  nextCode: string;
};

const LINE_CHANGED_STYLE_ELEMENT_ID = 'headlamp-editor-external-change-style';

/**
 * Lookahead window size for the lightweight line-diff realignment heuristic.
 *
 * We keep this intentionally small to avoid O(n^2) behavior on large YAMLs, while still being
 * large enough to resync across common Kubernetes YAML edits (e.g. inserting/removing a few
 * lines inside a block such as labels/env/annotations).
 */
const LINE_DIFF_REALIGN_LOOKAHEAD = 40;

/**
 * Safety limits for external-change line diffing.
 *
 * In watch mode, the editor might receive very large YAML/JSON documents. Even with a small
 * lookahead window, iterating thousands of lines and performing per-line comparisons can become
 * noticeable. When the input is too large (or the heuristic would do too much work), we fall
 * back to a cheap O(n) single-range approximation.
 */
const MAX_LINE_DIFF_LINES = 20000;
const MAX_LINE_DIFF_OPS = 250000;

/**
 * We only ever decorate up to MAX_EXTERNAL_CHANGE_HIGHLIGHT_LINES, so tracking far more than that
 * provides diminishing returns while increasing memory/CPU usage.
 */
const MAX_LINE_DIFF_TRACKED_CHANGED_LINES = 1000;

/**
 * Safety limit for how many changed lines we decorate/highlight at once.
 *
 * In watch mode, some updates can touch very large parts of the document; creating thousands of
 * per-line Monaco decorations can significantly degrade editor performance.
 */
const MAX_EXTERNAL_CHANGE_HIGHLIGHT_LINES = 200;
const HIGHLIGHT_FADE_DURATION_MS = 2500;

// Server-managed fields we generally don't want to treat as "user changes".
// Used both for external-change highlighting suppression and auto-merge diffing.
const ignoredServerManagedPathPrefixes: Path[] = [
  ['metadata', 'managedFields'],
  ['metadata', 'resourceVersion'],
  ['metadata', 'generation'],
  ['metadata', 'uid'],
  ['metadata', 'creationTimestamp'],
  ['status'],
];

function ensureLineChangedStyles() {
  if (typeof document === 'undefined') {
    return;
  }

  if (document.getElementById(LINE_CHANGED_STYLE_ELEMENT_ID)) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = LINE_CHANGED_STYLE_ELEMENT_ID;
  styleElement.textContent = `
@keyframes headlamp-editor-line-changed-fade {
  0% { background-color: rgba(255, 213, 79, 0.55); }
  100% { background-color: transparent; }
}
.headlamp-editor-external-change {
  background-color: rgba(255, 213, 79, 0.45);
}
.headlamp-editor-external-change-animate {
  animation: headlamp-editor-line-changed-fade ${HIGHLIGHT_FADE_DURATION_MS}ms ease-out forwards;
}
`;

  document.head.appendChild(styleElement);
}

export interface EditorDialogProps extends DialogProps {
  /** The object(s) to edit, or null to make the dialog be in "loading mode". Pass it an empty object if no contents are to be shown when the dialog is first open. */
  item: KubeObject | KubeObjectIsh | object | object[] | string | null;
  /** Called when the dialog is closed. */
  onClose: () => void;
  /** Called by a component for when the user clicks the save button. When set to "default", internal save logic is applied. */
  onSave?: ((...args: any[]) => void) | 'default' | null;
  /** Called when the editor's contents change. */
  onEditorChanged?: ((newValue: string) => void) | null;
  /** The function to open the dialog. */
  setOpen?: (open: boolean) => void;
  allowToHideManagedFields?: boolean;
  /** The label to use for the save button. */
  saveLabel?: string;
  /** The error message to display. */
  errorMessage?: string;
  /** The dialog title. */
  title?: string;
  /** Extra optional actions. */
  actions?: React.ReactNode[];
  /** Don't render the editor in the dialog */
  noDialog?: boolean;
}

function isKubeObjectInstance(item: unknown): item is KubeObject {
  // Avoid relying on `instanceof` (can fail across bundles/plugins).
  if (!item || typeof item !== 'object') return false;
  return (item as any)[KUBE_OBJECT_BRAND] === true;
}

type EditorDialogInnerProps = Omit<EditorDialogProps, 'item'> & {
  item: KubeObjectIsh | object | object[] | string | null;
};

function KubeObjectLiveEditorDialog(props: Omit<EditorDialogProps, 'item'> & { item: KubeObject }) {
  const { item: kubeItem, ...rest } = props;
  const kubeObjectClass = kubeItem.constructor as typeof KubeObject;

  const [liveKubeItem, error] = kubeObjectClass.useGet(
    kubeItem.getName(),
    kubeItem.getNamespace(),
    {
      cluster: kubeItem.cluster,
    }
  );

  const editableItem = React.useMemo(
    () => (liveKubeItem ?? kubeItem).getEditableObject(),
    [liveKubeItem, kubeItem]
  );

  if (!liveKubeItem && !error) {
    return <Loader title={t('translation|Loading resource')} />;
  }

  if (error) {
    return (
      <Empty color="error">
        {t('translation|Error getting resource {{ resourceName }}: {{ errorMessage }}', {
          resourceName: kubeItem.getName(),
          errorMessage: error,
        })}
      </Empty>
    );
  }

  return <EditorDialogInner {...rest} item={editableItem} />;
}

function EditorDialogInner(props: EditorDialogInnerProps) {
  const {
    item,
    onClose,
    onSave = 'default',
    onEditorChanged,
    setOpen,
    saveLabel,
    errorMessage,
    allowToHideManagedFields,
    title,
    actions = [],
    ...other
  } = props;
  const editorOptions = {
    selectOnLineNumbers: true,
    readOnly: isReadOnly(),
    automaticLayout: true,
  };
  const initialCode = typeof item === 'string' ? item : yaml.dump(item || {});
  const originalCodeRef = React.useRef({ code: initialCode, format: item ? 'yaml' : '' });
  const [code, setCode] = React.useState(originalCodeRef.current);
  const codeRef = React.useRef(code);
  const lastCodeCheckHandler = React.useRef(0);
  const baselineVersionRef = React.useRef(
    isKubeObjectIsh(item) ? item?.metadata?.resourceVersion || '' : ''
  );
  const [latestServerCode, setLatestServerCode] = React.useState<string>(initialCode);
  const [serverUpdatedWhileEditing, setServerUpdatedWhileEditing] = React.useState(false);
  const [error, setError] = React.useState('');
  const [docSpecs, setDocSpecs] = React.useState<
    KubeObjectInterface | KubeObjectInterface[] | null
  >([]);
  const { t } = useTranslation();

  const theme = useCurrentAppTheme();
  const monacoEditorRef = React.useRef<any>(null);
  const monacoRef = React.useRef<any>(null);
  const monacoDecorationsRef = React.useRef<string[]>([]);
  const pendingViewStateRestoreRef = React.useRef<{
    viewState: any;
    position: any;
    scrollTop: number | null;
    scrollLeft: number | null;
  } | null>(null);
  const lastExternalHighlightRangesRef = React.useRef<Array<{
    startLine: number;
    endLine: number;
  }> | null>(null);
  const pendingReapplyExternalHighlightRef = React.useRef(false);
  const simpleEditorRef = React.useRef<HTMLTextAreaElement | null>(null);
  const highlightRequestRef = React.useRef<HighlightRequest | null>(null);
  const highlightTimeoutRef = React.useRef<number | null>(null);
  const hasEverRenderedCodeRef = React.useRef(false);

  const [hideManagedFields, setHideManagedFields] = useLocalStorageState<boolean>(
    'hideManagedFields',
    true
  );
  const [useSimpleEditor, setUseSimpleEditor] = useLocalStorageState<boolean>(
    'useSimpleEditor',
    false
  );
  const [uploadFiles, setUploadFiles] = React.useState(false);

  const dispatchCreateEvent = useEventCallback(HeadlampEventType.CREATE_RESOURCE);
  const dispatch: AppDispatch = useDispatch();

  function isKubeObjectIsh(item: any): item is KubeObjectIsh {
    return item && typeof item === 'object' && !Array.isArray(item) && 'metadata' in item;
  }

  function computeChangedLineRanges(
    prev: string,
    next: string
  ): Array<{ startLine: number; endLine: number }> {
    if (prev === next) return [];

    // Normalize line endings so we don't accidentally treat CRLF/LF differences as content diffs.
    const prevLines = prev.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const nextLines = next.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    /**
     * Fast, coarse diff for very large documents: find common prefix/suffix and return
     * one contiguous changed range in the "next" buffer (best-effort).
     *
     * This intentionally sacrifices multi-hunk accuracy in exchange for predictable runtime.
     */
    const computeSingleChangedRange = (): Array<{ startLine: number; endLine: number }> => {
      const minLen = Math.min(prevLines.length, nextLines.length);

      let start = 0;
      while (start < minLen && prevLines[start] === nextLines[start]) {
        start += 1;
      }

      let endPrev = prevLines.length - 1;
      let endNext = nextLines.length - 1;
      while (endPrev >= start && endNext >= start && prevLines[endPrev] === nextLines[endNext]) {
        endPrev -= 1;
        endNext -= 1;
      }

      // Deletion-only changes can result in no differing line index in "next"; highlight an anchor.
      if (endNext < start) {
        const anchorIdx = Math.min(start, Math.max(0, nextLines.length - 1));
        return [{ startLine: anchorIdx + 1, endLine: anchorIdx + 1 }];
      }

      // Cap the returned range to keep downstream processing (filtering/decorations) bounded.
      const endIdx = Math.min(endNext, start + MAX_LINE_DIFF_TRACKED_CHANGED_LINES - 1);
      return [{ startLine: start + 1, endLine: endIdx + 1 }];
    };

    if (Math.max(prevLines.length, nextLines.length) > MAX_LINE_DIFF_LINES) {
      return computeSingleChangedRange();
    }

    /**
     * Heuristic line-diff:
     * - Tracks changed line indices in the "next" buffer.
     * - Uses a small lookahead window to realign after insertions/deletions.
     *
     * This is intentionally lightweight and avoids the previous "single big range" approach
     * which caused unrelated blocks to be highlighted when there were multiple diff hunks
     * (e.g. metadata/status changes far apart).
     */
    const changedNextLineIdx = new Set<number>();
    let i = 0;
    let j = 0;
    let ops = 0;

    while (i < prevLines.length && j < nextLines.length) {
      ops += 1;
      if (ops > MAX_LINE_DIFF_OPS) {
        return computeSingleChangedRange();
      }
      if (prevLines[i] === nextLines[j]) {
        i += 1;
        j += 1;
        continue;
      }

      // Try to realign by looking ahead for a matching anchor line.
      let matchInPrev = -1;
      for (
        let ii = i + 1;
        ii < Math.min(prevLines.length, i + LINE_DIFF_REALIGN_LOOKAHEAD);
        ii += 1
      ) {
        ops += 1;
        if (ops > MAX_LINE_DIFF_OPS) {
          return computeSingleChangedRange();
        }
        if (prevLines[ii] === nextLines[j]) {
          matchInPrev = ii;
          break;
        }
      }

      let matchInNext = -1;
      for (
        let jj = j + 1;
        jj < Math.min(nextLines.length, j + LINE_DIFF_REALIGN_LOOKAHEAD);
        jj += 1
      ) {
        ops += 1;
        if (ops > MAX_LINE_DIFF_OPS) {
          return computeSingleChangedRange();
        }
        if (nextLines[jj] === prevLines[i]) {
          matchInNext = jj;
          break;
        }
      }

      // Prefer the shorter jump (local change) when both options exist.
      const prevJump = matchInPrev === -1 ? Number.POSITIVE_INFINITY : matchInPrev - i;
      const nextJump = matchInNext === -1 ? Number.POSITIVE_INFINITY : matchInNext - j;

      if (nextJump < prevJump) {
        // Insertion(s) in next: mark the inserted block.
        for (let jj = j; jj < matchInNext; jj += 1) {
          changedNextLineIdx.add(jj);
          if (changedNextLineIdx.size >= MAX_LINE_DIFF_TRACKED_CHANGED_LINES) {
            break;
          }
        }
        j = matchInNext;
        if (changedNextLineIdx.size >= MAX_LINE_DIFF_TRACKED_CHANGED_LINES) {
          break;
        }
        continue;
      }

      if (prevJump < Number.POSITIVE_INFINITY) {
        // Deletion(s) from prev: there's no corresponding "next" line to highlight,
        // but we still mark the current next line as an anchor so the user sees *where* it happened.
        changedNextLineIdx.add(j);
        if (changedNextLineIdx.size >= MAX_LINE_DIFF_TRACKED_CHANGED_LINES) {
          break;
        }
        i = matchInPrev;
        continue;
      }

      // Replacement: mark the current next line as changed and advance both.
      changedNextLineIdx.add(j);
      if (changedNextLineIdx.size >= MAX_LINE_DIFF_TRACKED_CHANGED_LINES) {
        break;
      }
      i += 1;
      j += 1;
    }

    // Any remaining next lines are insertions.
    while (j < nextLines.length) {
      changedNextLineIdx.add(j);
      if (changedNextLineIdx.size >= MAX_LINE_DIFF_TRACKED_CHANGED_LINES) {
        break;
      }
      j += 1;
    }

    const sorted = Array.from(changedNextLineIdx).sort((a, b) => a - b);
    if (sorted.length === 0) return [];

    // Convert into 1-based contiguous ranges.
    const ranges: Array<{ startLine: number; endLine: number }> = [];
    let start = sorted[0];
    let end = sorted[0];
    for (let idx = 1; idx < sorted.length; idx += 1) {
      const cur = sorted[idx];
      if (cur === end + 1) {
        end = cur;
      } else {
        ranges.push({ startLine: start + 1, endLine: end + 1 });
        start = cur;
        end = cur;
      }
    }
    ranges.push({ startLine: start + 1, endLine: end + 1 });

    return ranges;
  }

  function shouldIgnoreHighlightPath(path: Path) {
    return ignoredServerManagedPathPrefixes.some(prefix => pathStartsWith(path, prefix));
  }

  function stripIgnoredHighlightFields(value: any, path: Path = []): any {
    if (shouldIgnoreHighlightPath(path)) return undefined;

    if (Array.isArray(value)) {
      return value.map((v, idx) => stripIgnoredHighlightFields(v, [...path, idx]));
    }

    if (value !== null && typeof value === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        const stripped = stripIgnoredHighlightFields(v, [...path, k]);
        if (stripped !== undefined) {
          out[k] = stripped;
        }
      }
      return out;
    }

    return value;
  }

  function shouldSkipExternalChangeHighlightBecauseOnlyIgnoredFieldsChanged(
    prev: string,
    next: string
  ): boolean {
    try {
      const prevHint = looksLikeJson(prev) ? 'json' : 'yaml';
      const nextHint = looksLikeJson(next) ? 'json' : 'yaml';
      const prevObj = parseSingleDoc(prev, prevHint).obj;
      const nextObj = parseSingleDoc(next, nextHint).obj;
      if (!prevObj || !nextObj) return false;

      const prevStripped = stripIgnoredHighlightFields(prevObj);
      const nextStripped = stripIgnoredHighlightFields(nextObj);
      return _.isEqual(prevStripped, nextStripped);
    } catch {
      // Best-effort: if parsing fails, fall back to line-based diff highlighting.
      return false;
    }
  }

  function computeIgnoredHighlightLineNumbers(nextLines: string[]): Set<number> {
    const ignored = new Set<number>();

    // YAML-style lines for common server-managed metadata fields.
    const ignoredKeyLine =
      /^\s*(resourceVersion|generation|uid|creationTimestamp|managedFields)\s*:/;
    for (let i = 0; i < nextLines.length; i += 1) {
      if (ignoredKeyLine.test(nextLines[i])) {
        ignored.add(i + 1); // 1-based line number
      }
    }

    // Skip the entire managedFields block (YAML), not only the header line.
    const managedFieldsHeader = /^\s*managedFields\s*:\s*$/;
    for (let i = 0; i < nextLines.length; i += 1) {
      const line = nextLines[i];
      if (!managedFieldsHeader.test(line)) continue;

      const startIndent = (line.match(/^\s*/) || [''])[0].length;
      ignored.add(i + 1);

      for (let j = i + 1; j < nextLines.length; j += 1) {
        const l = nextLines[j];
        const trimmed = l.trim();
        if (trimmed === '') {
          ignored.add(j + 1);
          continue;
        }
        const indent = (l.match(/^\s*/) || [''])[0].length;
        if (indent <= startIndent) break;
        ignored.add(j + 1);
      }
    }

    return ignored;
  }

  function filterChangedLineRangesForHighlight(
    next: string,
    ranges: Array<{ startLine: number; endLine: number }>
  ): Array<{ startLine: number; endLine: number }> {
    if (ranges.length === 0) return ranges;

    const nextLines = next.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const ignored = computeIgnoredHighlightLineNumbers(nextLines);

    const keptLines: number[] = [];
    for (const r of ranges) {
      for (let lineNumber = r.startLine; lineNumber <= r.endLine; lineNumber += 1) {
        if (!ignored.has(lineNumber)) keptLines.push(lineNumber);
      }
    }
    if (keptLines.length === 0) return [];

    keptLines.sort((a, b) => a - b);
    const out: Array<{ startLine: number; endLine: number }> = [];
    let start = keptLines[0];
    let end = keptLines[0];
    for (let idx = 1; idx < keptLines.length; idx += 1) {
      const cur = keptLines[idx];
      if (cur === end + 1) {
        end = cur;
      } else {
        out.push({ startLine: start, endLine: end });
        start = cur;
        end = cur;
      }
    }
    out.push({ startLine: start, endLine: end });
    return out;
  }

  function queueExternalHighlight(previousCode: string, nextCode: string) {
    if (!hasEverRenderedCodeRef.current) {
      // Avoid highlighting on the very first render/mount.
      return;
    }
    if (previousCode === nextCode) return;
    highlightRequestRef.current = { previousCode, nextCode };
  }

  function setCodeExternally(
    next: { code: string; format: string },
    previousCodeOverride?: string
  ) {
    const previous = previousCodeOverride ?? codeRef.current.code;
    queueExternalHighlight(previous, next.code);
    setCode(next);
  }

  function setCodeExternallyUpdater(
    updater: React.SetStateAction<{ code: string; format: string }>
  ) {
    setCode(current => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      queueExternalHighlight(current.code, next.code);
      return next;
    });
  }

  function focusAndHighlightExternalChange(prev: string, next: string) {
    if (shouldSkipExternalChangeHighlightBecauseOnlyIgnoredFieldsChanged(prev, next)) {
      return;
    }

    const ranges = filterChangedLineRangesForHighlight(next, computeChangedLineRanges(prev, next));
    if (ranges.length === 0) return;
    ensureLineChangedStyles();
    lastExternalHighlightRangesRef.current = ranges;
    pendingReapplyExternalHighlightRef.current = false;

    // Prevent multiple pending timeouts from clearing the latest highlight unexpectedly.
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    const firstChangedLine = ranges[0].startLine;

    // Monaco: decoration + reveal/focus
    if (monacoEditorRef.current && monacoRef.current) {
      const editor = monacoEditorRef.current;
      const monaco = monacoRef.current;
      const decorations = [];
      const maxDecorations = MAX_EXTERNAL_CHANGE_HIGHLIGHT_LINES;
      let used = 0;
      for (const r of ranges) {
        for (let lineNumber = r.startLine; lineNumber <= r.endLine; lineNumber += 1) {
          decorations.push({
            range: new monaco.Range(lineNumber, 1, lineNumber, 1),
            options: {
              isWholeLine: true,
              className: 'headlamp-editor-external-change headlamp-editor-external-change-animate',
            },
          });
          used += 1;
          if (used >= maxDecorations) break;
        }
        if (used >= maxDecorations) break;
      }

      monacoDecorationsRef.current = editor.deltaDecorations(
        monacoDecorationsRef.current,
        decorations
      );
      editor.revealLineInCenter(firstChangedLine);
      editor.setPosition({ lineNumber: firstChangedLine, column: 1 });
      editor.focus();

      highlightTimeoutRef.current = window.setTimeout(() => {
        const currentEditor = monacoEditorRef.current;
        if (!currentEditor) return;
        monacoDecorationsRef.current = currentEditor.deltaDecorations(
          monacoDecorationsRef.current,
          []
        );
      }, HIGHLIGHT_FADE_DURATION_MS);
      return;
    }

    // Simple editor: highlight by selecting the changed block (best-effort)
    if (simpleEditorRef.current) {
      const el = simpleEditorRef.current;
      const lines = next.split('\n');
      const firstRange = ranges[0];
      const beforeStart = lines.slice(0, firstRange.startLine - 1).join('\n');
      const startOffset = beforeStart.length + (firstRange.startLine > 1 ? 1 : 0);
      const selectedLines = lines.slice(firstRange.startLine - 1, firstRange.endLine);
      const selectedText = selectedLines.join('\n');
      const endOffset = startOffset + selectedText.length;

      el.focus();
      try {
        el.setSelectionRange(startOffset, endOffset);
        const style = window.getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight || '16') || 16;
        el.scrollTop = Math.max(0, (firstChangedLine - 1) * lineHeight - el.clientHeight / 3);
      } catch {
        // ignore
      }

      highlightTimeoutRef.current = window.setTimeout(() => {
        const cur = simpleEditorRef.current;
        if (!cur) return;
        try {
          cur.setSelectionRange(endOffset, endOffset);
        } catch {
          // ignore
        }
      }, HIGHLIGHT_FADE_DURATION_MS);
    }
  }

  // Update the code when the item changes, but only if the code hasn't been touched.
  React.useEffect(() => {
    const clonedItem = _.cloneDeep(item);
    if (!item || Object.keys(item || {}).length === 0) {
      const defaultCode = '# Enter your YAML or JSON here';
      originalCodeRef.current = { code: defaultCode, format: 'yaml' };
      setCodeExternally({ code: defaultCode, format: 'yaml' });
      setLatestServerCode(defaultCode);
      setServerUpdatedWhileEditing(false);
      return;
    }

    if (allowToHideManagedFields && hideManagedFields) {
      if (isKubeObjectIsh(clonedItem) && clonedItem.metadata) {
        delete clonedItem.metadata.managedFields;
      }
    }

    // Determine the format (YAML or JSON) and serialize to string
    const format = looksLikeJson(originalCodeRef.current.code) ? 'json' : 'yaml';
    const itemCode = format === 'json' ? JSON.stringify(clonedItem) : yaml.dump(clonedItem);
    setLatestServerCode(itemCode);

    const isDirty = codeRef.current.code !== originalCodeRef.current.code;
    const nextResourceVersion =
      isKubeObjectIsh(item) && item.metadata ? item.metadata.resourceVersion || '' : '';

    if (!isDirty) {
      // Not edited: always follow the latest server representation.
      if (itemCode !== originalCodeRef.current.code) {
        const ignoreOnly = shouldSkipExternalChangeHighlightBecauseOnlyIgnoredFieldsChanged(
          originalCodeRef.current.code,
          itemCode
        );

        if (ignoreOnly) {
          // Keep the editor in sync (avoid later huge diffs), but don't highlight.
          // Preserve view state so fast status/managedFields churn doesn't move the viewport.
          if (
            monacoDecorationsRef.current.length > 0 &&
            lastExternalHighlightRangesRef.current &&
            lastExternalHighlightRangesRef.current.length > 0
          ) {
            pendingReapplyExternalHighlightRef.current = true;
          }
          if (monacoEditorRef.current && monacoEditorRef.current.saveViewState) {
            try {
              const editor = monacoEditorRef.current;
              pendingViewStateRestoreRef.current = {
                viewState: editor.saveViewState(),
                position: editor.getPosition ? editor.getPosition() : null,
                scrollTop: editor.getScrollTop ? editor.getScrollTop() : null,
                scrollLeft: editor.getScrollLeft ? editor.getScrollLeft() : null,
              };
            } catch {
              // ignore
            }
          }

          originalCodeRef.current = { code: itemCode, format };
          setCode({ code: itemCode, format });
        } else {
          originalCodeRef.current = { code: itemCode, format };
          setCodeExternally({ code: itemCode, format });
        }
      }
      setServerUpdatedWhileEditing(false);
      if (nextResourceVersion) {
        baselineVersionRef.current = nextResourceVersion;
      }
      return;
    }

    // Additional handling for Kubernetes objects
    if (isKubeObjectIsh(item) && item.metadata) {
      // Edited: never overwrite. If the server's resourceVersion changes, show a warning banner.
      const serverVersionChanged =
        !!nextResourceVersion && (baselineVersionRef.current || '') !== nextResourceVersion;
      if (serverVersionChanged) {
        setServerUpdatedWhileEditing(true);
      }
    }
  }, [item, hideManagedFields, allowToHideManagedFields]);

  React.useEffect(() => {
    codeRef.current = code;
  }, [code]);

  React.useEffect(() => {
    if (!hasEverRenderedCodeRef.current) {
      hasEverRenderedCodeRef.current = true;
      return;
    }

    // Restore view state after programmatic, non-highlight updates (ignored-only server changes).
    if (pendingViewStateRestoreRef.current && monacoEditorRef.current) {
      const editor = monacoEditorRef.current;
      const pending = pendingViewStateRestoreRef.current;
      pendingViewStateRestoreRef.current = null;
      try {
        if (pending.viewState && editor.restoreViewState) {
          editor.restoreViewState(pending.viewState);
        }
        if (pending.position && editor.setPosition) {
          editor.setPosition(pending.position);
        }
        if (pending.scrollTop !== null && editor.setScrollTop) {
          editor.setScrollTop(pending.scrollTop);
        }
        if (pending.scrollLeft !== null && editor.setScrollLeft) {
          editor.setScrollLeft(pending.scrollLeft);
        }
        if (editor.focus) {
          editor.focus();
        }
      } catch {
        // ignore
      }
    }

    // If an ignored-only update caused Monaco to drift decoration ranges, reapply them once.
    if (
      pendingReapplyExternalHighlightRef.current &&
      monacoEditorRef.current &&
      monacoRef.current &&
      lastExternalHighlightRangesRef.current
    ) {
      pendingReapplyExternalHighlightRef.current = false;
      try {
        const editor = monacoEditorRef.current;
        const monaco = monacoRef.current;
        const ranges = lastExternalHighlightRangesRef.current;
        const decorations: any[] = [];
        const maxDecorations = MAX_EXTERNAL_CHANGE_HIGHLIGHT_LINES;
        let used = 0;
        for (const r of ranges) {
          for (let lineNumber = r.startLine; lineNumber <= r.endLine; lineNumber += 1) {
            decorations.push({
              range: new monaco.Range(lineNumber, 1, lineNumber, 1),
              options: {
                isWholeLine: true,
                className: 'headlamp-editor-external-change',
              },
            });
            used += 1;
            if (used >= maxDecorations) break;
          }
          if (used >= maxDecorations) break;
        }
        monacoDecorationsRef.current = editor.deltaDecorations(
          monacoDecorationsRef.current,
          decorations
        );
      } catch {
        // ignore
      }
    }

    const req = highlightRequestRef.current;
    if (!req) return;
    if (req.nextCode !== code.code) return;
    focusAndHighlightExternalChange(req.previousCode, req.nextCode);
    highlightRequestRef.current = null;
  }, [code.code, useSimpleEditor]);

  function isReadOnly() {
    return onSave === null;
  }

  function looksLikeJson(code: string) {
    const trimmedCode = code.trimStart();
    const firstChar = !!trimmedCode ? trimmedCode[0] : '';
    if (['{', '['].includes(firstChar)) {
      return true;
    }
    return false;
  }

  function pathStartsWith(path: Path, prefix: Path) {
    if (prefix.length > path.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (path[i] !== prefix[i]) return false;
    }
    return true;
  }

  function shouldIgnoreMergePath(path: Path) {
    return ignoredServerManagedPathPrefixes.some(prefix => pathStartsWith(path, prefix));
  }

  function diffToPathOps(base: any, local: any, path: Path = []): PathOp[] {
    if (shouldIgnoreMergePath(path)) return [];
    if (_.isEqual(base, local)) return [];

    // Arrays (including when only one side is an array) are treated as atomic values.
    // This intentionally handles array/non-array type mismatches as full replacements
    // instead of attempting element-wise merges. As a consequence, if both sides modify
    // the same array, the merge logic will surface this as a single conflict that always
    // requires manual resolution rather than attempting to auto-merge individual elements.
    if (Array.isArray(base) || Array.isArray(local)) {
      return [{ type: 'set', path, baseValue: base, value: local }];
    }

    // Objects: recurse by keys.
    const baseIsObj = base !== null && typeof base === 'object';
    const localIsObj = local !== null && typeof local === 'object';
    if (baseIsObj && localIsObj) {
      const ops: PathOp[] = [];
      const keys = new Set<string>([...Object.keys(base), ...Object.keys(local)]);
      for (const key of keys) {
        const bHas = Object.prototype.hasOwnProperty.call(base, key);
        const lHas = Object.prototype.hasOwnProperty.call(local, key);
        const nextPath = [...path, key];
        if (!lHas && bHas) {
          if (!shouldIgnoreMergePath(nextPath)) {
            ops.push({ type: 'delete', path: nextPath, baseValue: base[key] });
          }
          continue;
        }
        if (lHas && !bHas) {
          if (!shouldIgnoreMergePath(nextPath)) {
            ops.push({
              type: 'set',
              path: nextPath,
              baseValue: undefined,
              value: local[key],
            });
          }
          continue;
        }
        ops.push(...diffToPathOps(base[key], local[key], nextPath));
      }
      return ops;
    }

    // Primitive or type-changed value: replace.
    return [{ type: 'set', path, baseValue: base, value: local }];
  }

  function getAtPath(root: any, path: Path) {
    let cur = root;
    for (const seg of path) {
      if (isNullable(cur)) return undefined;
      cur = cur[seg];
    }
    return cur;
  }

  /**
   * In-place variants for applying many ops efficiently.
   *
   * These mutate nested containers in-place (to avoid `_.cloneDeep` per operation), but they may
   * still replace the root value (e.g. when `path` is empty, or when `root` is not an object and
   * we need to materialize a container). Always use the returned root value.
   */
  function setAtPathInPlace(root: any, path: Path, value: any) {
    if (path.length === 0) return value;

    // Ensure root is a container we can assign into.
    if (root === null || typeof root !== 'object') {
      // We intentionally normalize the incoming root into an object/array here so that the
      // rest of this helper can perform in-place updates efficiently. Callers must always
      // use the returned root value, so this reassignment does not leak outside the function.
      // eslint-disable-next-line no-param-reassign
      root = typeof path[0] === 'number' ? [] : {};
    }

    let cur = root;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const nextSeg = path[i + 1];
      if (cur[seg] === null || typeof cur[seg] !== 'object') {
        cur[seg] = typeof nextSeg === 'number' ? [] : {};
      }
      cur = cur[seg];
    }
    cur[path[path.length - 1]] = value;
    return root;
  }

  /**
   * In-place delete variant for applying many ops efficiently.
   *
   * Note: an empty `path` is treated as a no-op (we never "delete the whole document" here).
   * Always use the returned root value.
   */
  function deleteAtPathInPlace(root: any, path: Path) {
    if (path.length === 0) return root;
    if (root === null || typeof root !== 'object') return root;
    let cur: any = root;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      if (isNullable(cur)) return root;
      cur = cur[seg];
    }
    if (cur && typeof cur === 'object') {
      delete cur[path[path.length - 1]];
    }
    return root;
  }

  function parseSingleDoc(
    codeStr: string,
    formatHint: string
  ): { obj: any | null; format: string } {
    const { obj, format, error } = getObjectsFromCode({ code: codeStr, format: formatHint });
    if (error) throw error;
    if (!obj || obj.length !== 1) {
      throw new Error(
        t('translation|Automatic merge is only supported for a single YAML/JSON document.')
      );
    }
    return { obj: obj[0], format };
  }

  function stringifyDoc(obj: any, format: string) {
    if (format === 'json') {
      try {
        return JSON.stringify(
          obj,
          (_, value) => (typeof value === 'bigint' ? value.toString() : value),
          2
        );
      } catch (error) {
        throw new Error(
          `Failed to serialize document to JSON: ${(error as Error)?.message ?? String(error)}`
        );
      }
    }
    return yaml.dump(obj);
  }

  function mergeLocalIntoServer({
    baseCode,
    localCode,
    serverCode,
    formatHint,
  }: {
    baseCode: string;
    localCode: string;
    serverCode: string;
    formatHint: string;
  }): { mergedCode: string; conflicts: string[] } {
    const base = parseSingleDoc(baseCode, formatHint);
    const local = parseSingleDoc(localCode, base.format);
    const server = parseSingleDoc(serverCode, base.format);

    const ops = diffToPathOps(base.obj, local.obj);
    const conflicts: string[] = [];
    const serverObj = server.obj;
    // Clone once, then apply all ops in-place to avoid O(n * cloneDeep(server)).
    let mergedObj: any = _.cloneDeep(serverObj ?? {});

    for (const op of ops) {
      const serverAtPath = getAtPath(serverObj, op.path);
      const baseAtPath = op.baseValue;
      const localTarget = op.type === 'set' ? op.value : undefined;

      const serverChangedSinceBase = !_.isEqual(serverAtPath, baseAtPath);
      const localDiffersFromServer = !_.isEqual(localTarget, serverAtPath);
      if (serverChangedSinceBase && localDiffersFromServer) {
        conflicts.push(op.path.map(String).join('.'));
        continue;
      }

      if (op.type === 'set') {
        mergedObj = setAtPathInPlace(mergedObj, op.path, op.value);
      } else {
        mergedObj = deleteAtPathInPlace(mergedObj, op.path);
      }
    }

    return { mergedCode: stringifyDoc(mergedObj, base.format), conflicts };
  }

  function onChange(value: string | undefined): void {
    window.clearTimeout(lastCodeCheckHandler.current);

    // Only check the code for errors after the user has stopped typing for a moment.
    lastCodeCheckHandler.current = window.setTimeout(() => {
      const { error: err, format } = getObjectsFromCode({
        code: value || '',
        format: originalCodeRef.current.format,
      });
      if (code.format !== format) {
        setCode(currentCode => ({ code: currentCode.code || '', format }));
      }

      if (error !== (err?.message || '')) {
        setError(err?.message || '');
      }
    }, 500); // ms

    setCode(currentCode => ({ code: value ?? '', format: currentCode.format }));

    if (onEditorChanged) {
      onEditorChanged(value ?? '');
    }
  }

  function getObjectsFromCode(codeInfo: typeof originalCodeRef.current): {
    obj: KubeObjectInterface[] | null;
    format: string;
    error: Error | null;
  } {
    const { code, format } = codeInfo;
    const res: { obj: KubeObjectInterface[] | null; format: string; error: Error | null } = {
      obj: null,
      format,
      error: null,
    };

    if (!format || (!res.obj && looksLikeJson(code))) {
      res.format = 'json';
      try {
        let helperArr = [];
        const parsedCode = JSON.parse(code);
        if (!Array.isArray(parsedCode)) {
          helperArr.push(parsedCode);
        } else {
          helperArr = parsedCode;
        }
        res.obj = helperArr;
        return res;
      } catch (e) {
        res.error = new Error((e as Error).message || t('Invalid JSON'));
      }
    }

    if (!res.obj) {
      res.format = 'yaml';
      try {
        res.obj = yaml.loadAll(code) as KubeObjectInterface[];
        res.obj = res.obj.filter(obj => !!obj);
        return res;
      } catch (e) {
        res.error = new Error((e as Error).message || t('Invalid YAML'));
      }
    }

    if (!!res.obj) {
      res.error = null;
    }

    return res;
  }

  function handleTabChange(tabIndex: number) {
    // Check if the docs tab has been selected.
    if (tabIndex !== 1) {
      return;
    }

    const { obj: codeObjs } = getObjectsFromCode(code);
    setDocSpecs(codeObjs);
  }

  function onUndo() {
    setCode(originalCodeRef.current);
    setServerUpdatedWhileEditing(false);
  }

  const applyFunc = async (newItems: KubeObjectInterface[], clusterName: string) => {
    await Promise.allSettled(newItems.map(newItem => apply(newItem, clusterName))).then(
      (values: any) => {
        values.forEach((value: any, index: number) => {
          if (value.status === 'rejected') {
            let msg;
            const kind = newItems[index].kind;
            const name = newItems[index].metadata.name;
            const apiVersion = newItems[index].apiVersion;
            if (newItems.length === 1) {
              msg = t('translation|Failed to create {{ kind }} {{ name }}.', { kind, name });
            } else {
              msg = t('translation|Failed to create {{ kind }} {{ name }} in {{ apiVersion }}.', {
                kind,
                name,
                apiVersion,
              });
            }
            const errorDetail = value.reason?.message || msg;
            setError(errorDetail);
            setOpen?.(true);
            // throw msg;
            throw new Error(msg);
          }
        });
      }
    );
    onClose();
  };

  function handleSave() {
    // Verify the YAML even means anything before trying to use it.
    const { obj, format, error } = getObjectsFromCode(code);
    if (error) {
      setError(t('Error parsing the code: {{error}}', { error: error.message }));
      return;
    }

    if (format !== code.format) {
      setCode(currentCode => ({ code: currentCode.code, format }));
    }

    if (!getObjectsFromCode(code)) {
      setError(t("Error parsing the code. Please verify it's valid YAML or JSON!"));
      return;
    }

    const newItemDefs = obj!;

    if (typeof onSave === 'string' && onSave === 'default') {
      const resourceNames = newItemDefs.map(newItemDef => newItemDef.metadata.name);
      const clusterName = (item as KubeObjectIsh)?.cluster || getCluster() || '';

      dispatch(
        clusterAction(() => applyFunc(newItemDefs, clusterName), {
          startMessage: t('translation|Applying {{ newItemName }}…', {
            newItemName: resourceNames.join(','),
          }),
          cancelledMessage: t('translation|Cancelled applying {{ newItemName }}.', {
            newItemName: resourceNames.join(','),
          }),
          successMessage: t('translation|Applied {{ newItemName }}.', {
            newItemName: resourceNames.join(','),
          }),
          errorMessage: t('translation|Failed to apply {{ newItemName }}.', {
            newItemName: resourceNames.join(','),
          }),
        })
      );

      dispatchCreateEvent({
        status: EventStatus.CONFIRMED,
      });
    } else if (typeof onSave === 'function') {
      onSave!(obj);
    }
  }

  function makeEditor() {
    const language = originalCodeRef.current.format || 'yaml';
    return (
      <Box height="100%">
        {useSimpleEditor ? (
          <SimpleEditor
            ref={simpleEditorRef}
            language={language}
            value={code.code}
            onChange={onChange}
          />
        ) : (
          <Editor
            language={language}
            theme={theme.base === 'dark' ? 'vs-dark' : 'light'}
            value={code.code}
            options={editorOptions}
            onChange={onChange}
            onMount={(editor, monaco) => {
              monacoEditorRef.current = editor;
              monacoRef.current = monaco;
              monacoDecorationsRef.current = [];
            }}
            height="100%"
          />
        )}
      </Box>
    );
  }

  const errorLabel = error || errorMessage;
  let dialogTitle = title;
  if (!dialogTitle && item) {
    const itemName = (isKubeObjectIsh(item) && item.metadata?.name) || t('New Object');
    dialogTitle = isReadOnly()
      ? t('translation|View: {{ itemName }}', { itemName })
      : t('translation|Edit: {{ itemName }}', { itemName });
  }

  const dialogTitleId = useId('editor-dialog-title-');

  const content = !item ? (
    <Loader title={t('Loading editor')} />
  ) : (
    <React.Fragment>
      {uploadFiles ? (
        <UploadDialog setUploadFiles={setUploadFiles} setCode={setCodeExternallyUpdater} />
      ) : (
        ''
      )}
      <DialogContent
        sx={{
          height: '80%',
          overflowY: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box py={1}>
          <Grid container spacing={2} justifyContent="space-between">
            {
              actions.length > 0 ? (
                actions.map((action, i) => (
                  <Grid item key={`editor_action_${i}`}>
                    {action}
                  </Grid>
                ))
              ) : (
                <Grid item></Grid>
              ) // Just to keep the layout consistent.
            }
            <Grid item>
              <FormGroup row>
                {allowToHideManagedFields && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={hideManagedFields}
                        onChange={() => setHideManagedFields(() => !hideManagedFields)}
                        name="hideManagedFields"
                      />
                    }
                    label={t('Hide Managed Fields')}
                  />
                )}
                <FormControlLabel
                  control={
                    <Switch
                      checked={useSimpleEditor}
                      onChange={() => setUseSimpleEditor(() => !useSimpleEditor)}
                      name="useSimpleEditor"
                    />
                  }
                  label={t('Use minimal editor')}
                />
                <Button
                  variant="contained"
                  onClick={() => {
                    setUploadFiles(true);
                  }}
                >
                  {t('translation|Upload File/URL')}
                </Button>
              </FormGroup>
            </Grid>
          </Grid>
        </Box>
        {serverUpdatedWhileEditing && (
          <Box sx={{ mt: 1, mb: 1 }}>
            <Alert
              severity="warning"
              variant="filled"
              sx={{
                alignItems: 'center',
                bgcolor: theme => theme.palette.warning.main,
                color: theme => theme.palette.warning.contrastText,
                '& .MuiAlert-icon': {
                  color: theme => theme.palette.warning.contrastText,
                },
                '& .MuiAlert-action': {
                  color: theme => theme.palette.warning.contrastText,
                },
              }}
              action={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    color="inherit"
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 600, borderColor: 'currentColor' }}
                    onClick={() => {
                      const prev = codeRef.current.code;
                      originalCodeRef.current = {
                        code: latestServerCode,
                        format: originalCodeRef.current.format,
                      };
                      setCodeExternally(
                        {
                          code: latestServerCode,
                          format: originalCodeRef.current.format,
                        },
                        prev
                      );
                      if (isKubeObjectIsh(item) && item.metadata?.resourceVersion) {
                        baselineVersionRef.current = item.metadata.resourceVersion;
                      }
                      setServerUpdatedWhileEditing(false);
                      setError('');
                    }}
                  >
                    {t('translation|Reload from server')}
                  </Button>
                  <Button
                    color="inherit"
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 600, borderColor: 'currentColor' }}
                    onClick={() => {
                      try {
                        const formatHint =
                          codeRef.current.format || originalCodeRef.current.format || 'yaml';
                        const { mergedCode, conflicts } = mergeLocalIntoServer({
                          baseCode: originalCodeRef.current.code,
                          localCode: codeRef.current.code,
                          serverCode: latestServerCode,
                          formatHint,
                        });

                        if (conflicts.length > 0) {
                          setError(
                            t(
                              'translation|Automatic merge failed due to conflicts. Please resolve manually.'
                            )
                          );
                          return;
                        }

                        // After a successful merge, set the server baseline to current server snapshot
                        // so subsequent merges/undo behave as expected.
                        originalCodeRef.current = {
                          code: latestServerCode,
                          format: codeRef.current.format,
                        };
                        setCodeExternally(
                          { code: mergedCode, format: codeRef.current.format },
                          codeRef.current.code
                        );
                        if (isKubeObjectIsh(item) && item.metadata?.resourceVersion) {
                          baselineVersionRef.current = item.metadata.resourceVersion;
                        }
                        setServerUpdatedWhileEditing(false);
                        setError('');
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    {t('translation|Merge my changes')}
                  </Button>
                </Box>
              }
            >
              {t('translation|This resource was updated on the server while you were editing.')}
            </Alert>
          </Box>
        )}
        {isReadOnly() ? (
          makeEditor()
        ) : (
          <Tabs
            onTabChanged={handleTabChange}
            ariaLabel={t('translation|Editor')}
            tabs={[
              {
                label: t('translation|Editor'),
                component: makeEditor(),
              },
              {
                label: t('translation|Documentation'),
                component: (
                  <Box sx={{ height: '100%', overflowY: 'auto' }}>
                    <DocsViewer docSpecs={docSpecs} />
                  </Box>
                ),
              },
            ]}
          />
        )}
      </DialogContent>
      <DialogActions>
        {!isReadOnly() && (
          <ConfirmButton
            disabled={originalCodeRef.current.code === code.code}
            color="secondary"
            variant="contained"
            aria-label={t('translation|Undo')}
            onConfirm={onUndo}
            confirmTitle={t('translation|Are you sure?')}
            confirmDescription={t(
              'This will discard your changes in the editor. Do you want to proceed?'
            )}
            // @todo: aria-controls should point to the textarea id
          >
            {t('translation|Undo Changes')}
          </ConfirmButton>
        )}
        <div style={{ flex: '1 0 0' }} />
        {errorLabel && <Typography color="error">{errorLabel}</Typography>}
        <div style={{ flex: '1 0 0' }} />
        <Button onClick={onClose} color="secondary" variant="contained">
          {t('translation|Close')}
        </Button>
        {!isReadOnly() && (
          <Button
            onClick={handleSave}
            color="primary"
            variant="contained"
            disabled={originalCodeRef.current.code === code.code || !!error}
            // @todo: aria-controls should point to the textarea id
          >
            {saveLabel || t('translation|Save & Apply')}
          </Button>
        )}
      </DialogActions>
    </React.Fragment>
  );

  if (!other.open && !other.keepMounted) {
    return null;
  }

  if (other.noDialog) {
    return content;
  }

  return (
    <Dialog
      title={dialogTitle}
      aria-busy={!item}
      maxWidth="lg"
      scroll="paper"
      fullWidth
      withFullScreen
      onClose={onClose}
      {...other}
      aria-labelledby={dialogTitleId}
      titleProps={{
        id: dialogTitleId,
      }}
    >
      {content}
    </Dialog>
  );
}

export default function EditorDialog(props: EditorDialogProps) {
  if (isKubeObjectInstance(props.item)) {
    const { item, ...rest } = props;
    return <KubeObjectLiveEditorDialog {...rest} item={item} />;
  }
  return <EditorDialogInner {...props} />;
}

export function ViewDialog(props: Omit<EditorDialogProps, 'onSave'>) {
  return <EditorDialog {...props} onSave={null} />;
}
