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

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLUSTER_TAGS_CHANGED_EVENT,
  ClusterTags,
  getClusterTagIdentity,
  getInvalidTagKeys,
  isValidTagKey,
  isValidTagValue,
  loadClusterTags,
} from '../../../helpers/clusterTags';
import type { Cluster } from '../../../lib/k8s/cluster';
import {
  labelMapsEqual,
  LabelRow,
  LabelTextField,
} from '../../common/Resource/CreateResourceForm/CreateResourceForm';
import { useClusterTagStorage } from './useClusterTagStorage';

/** Problems in the edited label rows that would be lost or rejected on save. */
export interface ClusterTagRowProblems {
  /** Number of rows without a key, which would otherwise be dropped silently. */
  emptyKeyCount: number;
  /** Keys used by more than one row; only the first row would be kept. */
  duplicateKeys: string[];
  /** Keys of rows whose key or value is not valid tag syntax. */
  invalidKeys: string[];
}

/** Finds the problems in edited label rows. */
export function getClusterTagRowProblems(
  rows: Pick<LabelRow, 'key' | 'value'>[]
): ClusterTagRowProblems {
  const keys = rows.map(row => row.key);
  return {
    emptyKeyCount: keys.filter(key => key === '').length,
    duplicateKeys: [
      ...new Set(keys.filter((key, index) => key !== '' && keys.indexOf(key) !== index)),
    ],
    invalidKeys: [
      ...new Set(
        rows
          .filter(row => row.key !== '' && (!isValidTagKey(row.key) || !isValidTagValue(row.value)))
          .map(row => row.key)
      ),
    ],
  };
}

/** Returns whether edited label rows have no problems. */
export function areClusterTagRowsValid(problems: ClusterTagRowProblems) {
  return (
    problems.emptyKeyCount === 0 &&
    problems.duplicateKeys.length === 0 &&
    problems.invalidKeys.length === 0
  );
}

export interface ClusterTagsEditorProps {
  /** The tags being edited. */
  value: ClusterTags;
  /** Called with the edited tags on every change. */
  onChange: (tags: ClusterTags) => void;
  /**
   * Called when the edited rows become valid or invalid. Rows with an empty or duplicate
   * key are not part of the tags passed to `onChange`, so saving must wait for this.
   */
  onValidityChange?: (valid: boolean) => void;
  /** Prevent edits while the submitted tags are being persisted. */
  disabled?: boolean;
}

/**
 * Edits a cluster's tags, reporting rows without a key, duplicate keys and tags that
 * are not valid tag syntax.
 */
export function ClusterTagsEditor({
  value,
  onChange,
  onValidityChange,
  disabled,
}: ClusterTagsEditorProps) {
  const { t } = useTranslation(['translation']);
  const [rows, setRows] = React.useState<LabelRow[] | null>(null);
  const problems = getClusterTagRowProblems(
    rows ?? Object.entries(value).map(([key, tagValue]) => ({ key, value: tagValue }))
  );
  const valid = areClusterTagRowsValid(problems);

  React.useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  return (
    <Box>
      <LabelTextField
        terminology="tag"
        value={value}
        onChange={onChange}
        onRowsChange={setRows}
        disabled={disabled}
      />
      {!valid && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {problems.emptyKeyCount > 0 && (
            <div>{t('translation|Every tag needs a key. Add a key or remove the tag.')}</div>
          )}
          {problems.duplicateKeys.length > 0 && (
            <div>
              {t('translation|Duplicate tag keys: {{ keys }}. Each key can only be used once.', {
                keys: problems.duplicateKeys.join(', '),
              })}
            </div>
          )}
          {problems.invalidKeys.length > 0 && (
            <div>
              {t(
                'translation|Invalid tags: {{ tags }}. Keys and values must use tag syntax: up to 63 alphanumeric characters, "-", "_" or ".", starting and ending with an alphanumeric character. Keys may have a DNS prefix, such as "example.com/team".',
                { tags: problems.invalidKeys.join(', ') }
              )}
            </div>
          )}
        </Alert>
      )}
    </Box>
  );
}

/** Returns whether edited tags differ from the saved ones and can be saved. */
export function canSaveClusterTags(saved: ClusterTags, draft: ClusterTags) {
  return !labelMapsEqual(saved, draft) && getInvalidTagKeys(draft).length === 0;
}

export interface ClusterTagsDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Name of the cluster whose tags are edited. */
  cluster: string;
  /** Configured context metadata, when available. */
  clusterInfo?: Cluster | null;
  /** Called when the dialog is closed, after saving or cancelling. */
  onClose: () => void;
}

/**
 * Dialog for editing a cluster's tags, which are stored in the browser's local settings.
 */
export default function ClusterTagsDialog({
  open,
  cluster,
  clusterInfo,
  onClose,
}: ClusterTagsDialogProps) {
  const { t } = useTranslation(['translation']);
  const [saved, setSaved] = React.useState<ClusterTags>({});
  const [draft, setDraft] = React.useState<ClusterTags>({});
  const [rowsValid, setRowsValid] = React.useState(true);
  const [editorRevision, setEditorRevision] = React.useState(0);
  const [storageRevision, setStorageRevision] = React.useState(0);
  const identity = getClusterTagIdentity(cluster, clusterInfo);
  const { save, saving, error, helpText } = useClusterTagStorage(cluster, clusterInfo);
  const previousSaved = React.useRef<{ open: boolean; identity: string; tags: ClusterTags }>({
    open: false,
    identity,
    tags: {},
  });
  const dialogSelection = React.useMemo(() => ({ open, identity }), [open, identity]);
  const currentDialog = React.useRef(dialogSelection);
  React.useLayoutEffect(() => {
    currentDialog.current = dialogSelection;
  }, [dialogSelection]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const refresh = () => setStorageRevision(revision => revision + 1);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === `cluster_settings.${cluster}`) {
        refresh();
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(CLUSTER_TAGS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(CLUSTER_TAGS_CHANGED_EVENT, refresh);
    };
  }, [open, cluster]);

  React.useEffect(() => {
    if (open) {
      const tags = loadClusterTags(cluster, clusterInfo);
      if (
        !previousSaved.current.open ||
        previousSaved.current.identity !== identity ||
        !labelMapsEqual(previousSaved.current.tags, tags)
      ) {
        setSaved(tags);
        setDraft(tags);
        setEditorRevision(revision => revision + 1);
      }
      previousSaved.current = { open, identity, tags };
    } else {
      previousSaved.current.open = false;
    }
  }, [open, cluster, clusterInfo, identity, storageRevision]);

  async function handleSave() {
    const dialog = currentDialog.current;
    if ((await save(draft)) && currentDialog.current === dialog && dialog.open) {
      onClose();
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('translation|Tags for {{ cluster }}', { cluster })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{helpText}</DialogContentText>
        <ClusterTagsEditor
          key={editorRevision}
          value={draft}
          onChange={setDraft}
          onValidityChange={setRowsValid}
          disabled={saving}
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" color="secondary" onClick={onClose} disabled={saving}>
          {t('translation|Cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !rowsValid || !canSaveClusterTags(saved, draft)}
        >
          {t('translation|Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
