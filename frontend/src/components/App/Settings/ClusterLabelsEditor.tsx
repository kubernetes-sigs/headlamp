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
  ClusterLabels,
  getInvalidLabelKeys,
  isValidLabelKey,
  isValidLabelValue,
  loadClusterLabels,
  storeClusterLabels,
} from '../../../helpers/clusterLabels';
import {
  labelMapsEqual,
  LabelRow,
  LabelTextField,
} from '../../common/Resource/CreateResourceForm/CreateResourceForm';

/** Problems in the edited label rows that would be lost or rejected on save. */
export interface ClusterLabelRowProblems {
  /** Number of rows without a key, which would otherwise be dropped silently. */
  emptyKeyCount: number;
  /** Keys used by more than one row; only the first row would be kept. */
  duplicateKeys: string[];
  /** Keys of rows whose key or value is not valid Kubernetes label syntax. */
  invalidKeys: string[];
}

/** Finds the problems in edited label rows. */
export function getClusterLabelRowProblems(
  rows: Pick<LabelRow, 'key' | 'value'>[]
): ClusterLabelRowProblems {
  const keys = rows.map(row => row.key);
  return {
    emptyKeyCount: keys.filter(key => key === '').length,
    duplicateKeys: [
      ...new Set(keys.filter((key, index) => key !== '' && keys.indexOf(key) !== index)),
    ],
    invalidKeys: [
      ...new Set(
        rows
          .filter(
            row => row.key !== '' && (!isValidLabelKey(row.key) || !isValidLabelValue(row.value))
          )
          .map(row => row.key)
      ),
    ],
  };
}

/** Returns whether edited label rows have no problems. */
export function areClusterLabelRowsValid(problems: ClusterLabelRowProblems) {
  return (
    problems.emptyKeyCount === 0 &&
    problems.duplicateKeys.length === 0 &&
    problems.invalidKeys.length === 0
  );
}

export interface ClusterLabelsEditorProps {
  /** The labels being edited. */
  value: ClusterLabels;
  /** Called with the edited labels on every change. */
  onChange: (labels: ClusterLabels) => void;
  /**
   * Called when the edited rows become valid or invalid. Rows with an empty or duplicate
   * key are not part of the labels passed to `onChange`, so saving must wait for this.
   */
  onValidityChange?: (valid: boolean) => void;
}

/**
 * Edits a cluster's labels, reporting rows without a key, duplicate keys and labels that
 * are not valid Kubernetes label syntax.
 */
export function ClusterLabelsEditor({
  value,
  onChange,
  onValidityChange,
}: ClusterLabelsEditorProps) {
  const { t } = useTranslation(['translation']);
  const [rows, setRows] = React.useState<LabelRow[] | null>(null);
  const problems = getClusterLabelRowProblems(
    rows ?? Object.entries(value).map(([key, labelValue]) => ({ key, value: labelValue }))
  );
  const valid = areClusterLabelRowsValid(problems);

  React.useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);

  return (
    <Box>
      <LabelTextField value={value} onChange={onChange} onRowsChange={setRows} />
      {!valid && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {problems.emptyKeyCount > 0 && (
            <div>{t('translation|Every label needs a key. Add a key or remove the label.')}</div>
          )}
          {problems.duplicateKeys.length > 0 && (
            <div>
              {t('translation|Duplicate label keys: {{ keys }}. Each key can only be used once.', {
                keys: problems.duplicateKeys.join(', '),
              })}
            </div>
          )}
          {problems.invalidKeys.length > 0 && (
            <div>
              {t(
                'translation|Invalid labels: {{ labels }}. Keys and values must use Kubernetes label syntax: up to 63 alphanumeric characters, "-", "_" or ".", starting and ending with an alphanumeric character. Keys may have a DNS prefix, such as "example.com/team".',
                { labels: problems.invalidKeys.join(', ') }
              )}
            </div>
          )}
        </Alert>
      )}
    </Box>
  );
}

/** Returns whether edited labels differ from the saved ones and can be saved. */
export function canSaveClusterLabels(saved: ClusterLabels, draft: ClusterLabels) {
  return !labelMapsEqual(saved, draft) && getInvalidLabelKeys(draft).length === 0;
}

export interface ClusterLabelsDialogProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Name of the cluster whose labels are edited. */
  cluster: string;
  /** Called when the dialog is closed, after saving or cancelling. */
  onClose: () => void;
}

/**
 * Dialog for editing a cluster's labels, which are stored in the browser's local settings.
 */
export default function ClusterLabelsDialog({ open, cluster, onClose }: ClusterLabelsDialogProps) {
  const { t } = useTranslation(['translation']);
  const [saved, setSaved] = React.useState<ClusterLabels>({});
  const [draft, setDraft] = React.useState<ClusterLabels>({});
  const [rowsValid, setRowsValid] = React.useState(true);

  React.useEffect(() => {
    if (open) {
      const labels = loadClusterLabels(cluster);
      setSaved(labels);
      setDraft(labels);
    }
  }, [open, cluster]);

  function handleSave() {
    storeClusterLabels(cluster, draft);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('translation|Labels for {{ cluster }}', { cluster })}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t(
            'translation|Organize clusters in Headlamp. Saved in this browser only; not applied to Kubernetes resources.'
          )}
        </DialogContentText>
        <ClusterLabelsEditor value={draft} onChange={setDraft} onValidityChange={setRowsValid} />
      </DialogContent>
      <DialogActions>
        <Button variant="contained" color="secondary" onClick={onClose}>
          {t('translation|Cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!rowsValid || !canSaveClusterLabels(saved, draft)}
        >
          {t('translation|Save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
