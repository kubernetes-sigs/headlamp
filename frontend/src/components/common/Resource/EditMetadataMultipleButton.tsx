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

import { Icon } from '@iconify/react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueries } from '@tanstack/react-query';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import type { KubeObject } from '../../../lib/k8s/KubeObject';
import { clusterAction } from '../../../redux/clusterActionSlice';
import {
  EventStatus,
  HeadlampEventType,
  useEventCallback,
} from '../../../redux/headlampEventSlice';
import { AppDispatch } from '../../../redux/stores/store';
import ActionButton, { ButtonStyle } from '../ActionButton';

interface KeyValueRow {
  id: string;
  key: string;
  value: string;
}

const MAX_CONCURRENT_PATCHES = 5;
// Cap how many failed resource names get inlined into a toast error so it stays readable.
// Full list is always logged to the console for debugging.
const MAX_NAMES_IN_ERROR_MESSAGE = 5;
// Above this selection size, auth checks are deferred until dialog open to avoid
// generating hundreds of SelfSubjectAccessReview requests on every selection change.
const MAX_EAGER_AUTH_ITEMS = 20;

function newRow(): KeyValueRow {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `row-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    key: '',
    value: '',
  };
}

enum ValidationError {
  KeyTooManySlashes = 'KeyTooManySlashes',
  PrefixEmpty = 'PrefixEmpty',
  PrefixTooLong = 'PrefixTooLong',
  PrefixInvalid = 'PrefixInvalid',
  KeyNameEmpty = 'KeyNameEmpty',
  KeyNameTooLong = 'KeyNameTooLong',
  KeyNameInvalid = 'KeyNameInvalid',
  ValueTooLong = 'ValueTooLong',
  ValueInvalid = 'ValueInvalid',
}

function translateValidationError(t: (key: string) => string, error: ValidationError): string {
  const messages: Record<ValidationError, string> = {
    [ValidationError.KeyTooManySlashes]: t('translation|Key may contain at most one "/" separator'),
    [ValidationError.PrefixEmpty]: t('translation|Prefix must not be empty'),
    [ValidationError.PrefixTooLong]: t('translation|Prefix must be 253 characters or fewer'),
    [ValidationError.PrefixInvalid]: t('translation|Prefix must be a valid DNS subdomain'),
    [ValidationError.KeyNameEmpty]: t('translation|Key name must not be empty'),
    [ValidationError.KeyNameTooLong]: t('translation|Key name must be 63 characters or fewer'),
    [ValidationError.KeyNameInvalid]: t(
      'translation|Key name must start/end with alphanumeric and contain only letters, numbers, "-", "_", "."'
    ),
    [ValidationError.ValueTooLong]: t('translation|Value must be 63 characters or fewer'),
    [ValidationError.ValueInvalid]: t(
      'translation|Value must start/end with alphanumeric and contain only letters, numbers, "-", "_", "."'
    ),
  };
  return messages[error];
}

// Validates a Kubernetes metadata key (optional DNS subdomain prefix + name segment).
// Ref: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#syntax-and-character-set
function validateK8sKey(key: string): ValidationError | null {
  if (!key) return null;
  const parts = key.split('/');
  if (parts.length > 2) return ValidationError.KeyTooManySlashes;

  const [prefix, name] = parts.length === 2 ? parts : [undefined, parts[0]];

  if (prefix !== undefined) {
    if (prefix.length === 0) return ValidationError.PrefixEmpty;
    if (prefix.length > 253) return ValidationError.PrefixTooLong;
    // Each dot-separated label must be a valid RFC 1123 DNS label (no consecutive dots/hyphens).
    const dnsLabelRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    const prefixValid = prefix
      .split('.')
      .every(label => label.length > 0 && label.length <= 63 && dnsLabelRe.test(label));
    if (!prefixValid) return ValidationError.PrefixInvalid;
  }

  if (!name) return ValidationError.KeyNameEmpty;
  if (name.length > 63) return ValidationError.KeyNameTooLong;
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-_.]*[a-zA-Z0-9])?$/.test(name))
    return ValidationError.KeyNameInvalid;

  return null;
}

// Validates a Kubernetes label value.
// Ref: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#syntax-and-character-set
function validateLabelValue(value: string): ValidationError | null {
  if (!value) return null;
  if (value.length > 63) return ValidationError.ValueTooLong;
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-_.]*[a-zA-Z0-9])?$/.test(value))
    return ValidationError.ValueInvalid;
  return null;
}

// Annotation values are arbitrary strings in Kubernetes; total annotation size is enforced elsewhere.
// eslint-disable-next-line no-unused-vars
function validateAnnotationValue(_value: string): ValidationError | null {
  return null;
}

interface EditMetadataMultipleButtonProps {
  items: KubeObject[];
  buttonStyle?: ButtonStyle;
  afterConfirm?: () => void;
}

/**
 * Returns true when a row has a validation problem that should block Apply.
 * Used both to disable the Apply button (hasValidationErrors) and to skip
 * rows in buildChanges; a single source of truth for "is this row a problem?".
 */
function rowHasError(
  r: KeyValueRow,
  validateValue: (v: string) => ValidationError | null,
  dupeKeys: Set<string>
): boolean {
  const trimmedKey = r.key.trim();
  const hasValue = r.value.length > 0;
  if (!trimmedKey && hasValue) return true;
  return (
    !!trimmedKey &&
    (!!validateK8sKey(trimmedKey) ||
      dupeKeys.has(trimmedKey) ||
      !!(hasValue && validateValue(r.value)))
  );
}

function computeDuplicateKeys(rows: KeyValueRow[]): Set<string> {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    if (seen.has(k)) dupes.add(k);
    else seen.add(k);
  }
  return dupes;
}

function makeAuthKey(item: KubeObject): string {
  const apiVersion = item.jsonData?.apiVersion ?? '';
  return `${item.cluster ?? ''}::${item.metadata?.namespace ?? ''}::${apiVersion}::${
    item.kind ?? ''
  }::${item.metadata?.name ?? ''}`;
}

/** Collect all unique keys that exist across the selected items for a given metadata field. */
function collectExistingKeys(
  items: KubeObject[],
  field: 'labels' | 'annotations'
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const dict = item.metadata?.[field] ?? {};
    for (const key of Object.keys(dict)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

interface MetadataTabPanelProps {
  rows: KeyValueRow[];
  keysToRemove: Set<string>;
  existingKeyCounts: Map<string, number>;
  totalItems: number;
  onAddRow: () => void;
  onChangeRow: (index: number, field: 'key' | 'value', value: string) => void;
  onRemoveRow: (index: number) => void;
  onToggleKeyRemoval: (key: string) => void;
  addUpdateLabel: string;
  addLabel: string;
  removeLabel: string;
  fieldName: string;
  validateValue: (value: string) => ValidationError | null;
  duplicateKeys: Set<string>;
}

function MetadataTabPanel(props: MetadataTabPanelProps) {
  const {
    rows,
    keysToRemove,
    existingKeyCounts,
    totalItems,
    onAddRow,
    onChangeRow,
    onRemoveRow,
    onToggleKeyRemoval,
    addUpdateLabel,
    addLabel,
    removeLabel,
    fieldName,
    validateValue,
    duplicateKeys,
  } = props;
  const { t } = useTranslation(['translation']);

  return (
    <Box sx={{ pt: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        {addUpdateLabel}
      </Typography>
      {rows.map((row, idx) => {
        const trimmedKey = row.key.trim();
        const hasValue = row.value !== '';
        const keyValidationError = trimmedKey ? validateK8sKey(trimmedKey) : null;
        const keyError = trimmedKey
          ? (keyValidationError ? translateValidationError(t, keyValidationError) : null) ??
            (duplicateKeys.has(trimmedKey) ? t('translation|Duplicate key') : null)
          : hasValue
          ? t('translation|Key is required when a value is provided')
          : null;
        const valueValidationError = hasValue ? validateValue(row.value) : null;
        const valueError = valueValidationError
          ? translateValidationError(t, valueValidationError)
          : null;
        return (
          <Grid container spacing={1} alignItems="flex-start" key={row.id} sx={{ mb: 1 }}>
            <Grid item xs={5}>
              <TextField
                size="small"
                fullWidth
                id={`${fieldName}-key-${idx}`}
                name={`${fieldName}-key-${idx}`}
                label={t('translation|Key')}
                value={row.key}
                onChange={e => onChangeRow(idx, 'key', e.target.value)}
                error={!!keyError}
                helperText={keyError ?? ' '}
                inputProps={{ 'aria-label': `${fieldName}-key-${idx}` }}
              />
            </Grid>
            <Grid item xs={5}>
              <TextField
                size="small"
                fullWidth
                id={`${fieldName}-value-${idx}`}
                name={`${fieldName}-value-${idx}`}
                label={t('translation|Value')}
                value={row.value}
                onChange={e => onChangeRow(idx, 'value', e.target.value)}
                error={!!valueError}
                helperText={valueError ?? ' '}
                inputProps={{ 'aria-label': `${fieldName}-value-${idx}` }}
              />
            </Grid>
            <Grid item xs={2} sx={{ pt: '8px !important' }}>
              <IconButton
                size="small"
                onClick={() => onRemoveRow(idx)}
                aria-label={t('translation|Remove row')}
              >
                <Icon icon="mdi:close" />
              </IconButton>
            </Grid>
          </Grid>
        );
      })}
      <Button
        size="small"
        startIcon={<Icon icon="mdi:plus" />}
        onClick={onAddRow}
        variant="outlined"
        sx={{ mt: 0.5 }}
      >
        {addLabel}
      </Button>

      {existingKeyCounts.size > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            {removeLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {t('translation|Click a key to mark it for removal from all selected items.')}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {Array.from(existingKeyCounts.entries()).map(([metaKey, count]) => {
              const isMarked = keysToRemove.has(metaKey);
              return (
                <Tooltip
                  key={metaKey}
                  title={t('translation|Present on {{ count }}/{{ total }} items', {
                    count,
                    total: totalItems,
                  })}
                >
                  <Chip
                    label={`${metaKey} (${count}/${totalItems})`}
                    size="small"
                    color={isMarked ? 'error' : 'default'}
                    variant={isMarked ? 'filled' : 'outlined'}
                    onClick={() => onToggleKeyRemoval(metaKey)}
                    onDelete={isMarked ? () => onToggleKeyRemoval(metaKey) : undefined}
                    aria-label={
                      isMarked
                        ? t('translation|Unmark "{{metaKey}}" for removal', { metaKey })
                        : t('translation|Mark "{{metaKey}}" for removal', { metaKey })
                    }
                  />
                </Tooltip>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/**
 * Returns true for any resource that exposes a patch() method and has not
 * explicitly opted out via supportsMetadataPatch = false.
 *
 * Intentionally broad: built-in kinds, CRDs, and plugin resources are all
 * included so long as they carry a patch capability. The RBAC patch permission
 * check (performed per-item before the dialog opens) is the real safety gate
 * that prevents unauthorized edits. Plugins that want to exclude a resource
 * type from batch metadata editing should set supportsMetadataPatch = false
 * on the resource class.
 */
export function isPatchableResource(item: KubeObject): boolean {
  const candidate = item as KubeObject & {
    patch?: unknown;
    supportsMetadataPatch?: boolean;
  };
  return (
    typeof candidate?.metadata === 'object' &&
    candidate.metadata !== null &&
    candidate.supportsMetadataPatch !== false &&
    typeof candidate.patch === 'function'
  );
}

export default function EditMetadataMultipleButton(props: EditMetadataMultipleButtonProps) {
  const dispatch: AppDispatch = useDispatch();
  const { items, buttonStyle, afterConfirm } = props;
  const [openDialog, setOpenDialog] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState(0);
  const { t } = useTranslation(['translation']);
  const location = useLocation();
  const dispatchEditMetadataEvent = useEventCallback(HeadlampEventType.EDIT_METADATA_RESOURCES);

  // Label editing state
  const [labelRows, setLabelRows] = React.useState<KeyValueRow[]>(() => [newRow()]);
  const [labelKeysToRemove, setLabelKeysToRemove] = React.useState<Set<string>>(new Set());

  // Annotation editing state
  const [annotationRows, setAnnotationRows] = React.useState<KeyValueRow[]>(() => [newRow()]);
  const [annotationKeysToRemove, setAnnotationKeysToRemove] = React.useState<Set<string>>(
    new Set()
  );

  // Authorization must be checked per selected item because RBAC may be restricted by
  // resource name. Reusing one SelfSubjectAccessReview result across items in the same
  // namespace/kind can over-include or under-include items when `resourceNames` rules apply.
  const authItems = React.useMemo(
    () =>
      (items ?? []).map(item => ({
        authKey: makeAuthKey(item),
        item,
        apiVersion: item.jsonData?.apiVersion ?? '',
      })),
    [items]
  );

  // Auth queries run eagerly for small selections so the trigger button can be
  // hidden/disabled when no items are permitted. For large selections (> MAX_EAGER_AUTH_ITEMS)
  // queries are deferred until the dialog opens to avoid a SSAR fan-out on every selection change.
  // staleTime prevents re-firing for the same item on rapid selection changes;
  // results are reused from cache when the dialog opens so no extra requests are made.
  const authQueries = useQueries({
    queries: authItems.map(({ item, apiVersion }) => ({
      queryKey: [
        'editMetadata:auth',
        item.cluster,
        item.metadata?.namespace,
        apiVersion,
        item.kind,
        item.metadata?.name,
      ],
      // Passing {} is correct: the instance method fills in name, namespace, group, and
      // version from the object's own data before delegating to the static SSAR method.
      queryFn: () => item.getAuthorization('patch', {}),
      enabled: openDialog || (items ?? []).length <= MAX_EAGER_AUTH_ITEMS,
      staleTime: 60_000,
    })),
  });

  const authByItemKey = React.useMemo(() => {
    const result = new Map<string, boolean>();
    authItems.forEach(({ authKey }, idx) => {
      result.set(authKey, authQueries[idx]?.data?.status?.allowed === true);
    });
    return result;
  }, [authItems, authQueries]);

  const authorizedItems = React.useMemo(
    () => (items ?? []).filter(item => authByItemKey.get(makeAuthKey(item)) === true),
    [items, authByItemKey]
  );

  // Disabled queries (large selection, dialog closed) report status === 'pending' but are not
  // actually in-flight. Treat that case as "checks deferred" rather than "checks pending".
  const authQueriesDeferred = !openDialog && (items ?? []).length > MAX_EAGER_AUTH_ITEMS;
  const authChecksPending = !authQueriesDeferred && authQueries.some(q => q.status === 'pending');

  const existingLabelCounts = React.useMemo(
    () => collectExistingKeys(authorizedItems, 'labels'),
    [authorizedItems]
  );
  const existingAnnotationCounts = React.useMemo(
    () => collectExistingKeys(authorizedItems, 'annotations'),
    [authorizedItems]
  );

  const labelDuplicateKeys = React.useMemo(() => computeDuplicateKeys(labelRows), [labelRows]);
  const annotationDuplicateKeys = React.useMemo(
    () => computeDuplicateKeys(annotationRows),
    [annotationRows]
  );

  const hasValidationErrors = React.useMemo(
    () =>
      labelRows.some(r => rowHasError(r, validateLabelValue, labelDuplicateKeys)) ||
      annotationRows.some(r => rowHasError(r, validateAnnotationValue, annotationDuplicateKeys)),
    [labelRows, annotationRows, labelDuplicateKeys, annotationDuplicateKeys]
  );

  function resetState() {
    setActiveTab(0);
    setLabelRows([newRow()]);
    setLabelKeysToRemove(new Set());
    setAnnotationRows([newRow()]);
    setAnnotationKeysToRemove(new Set());
  }

  function handleOpen() {
    resetState();
    setOpenDialog(true);
  }

  function handleClose() {
    setOpenDialog(false);
  }

  function makeChangeRowHandler(
    setRows: React.Dispatch<React.SetStateAction<KeyValueRow[]>>
  ): (index: number, field: 'key' | 'value', value: string) => void {
    return (index, field, value) => {
      setRows(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    };
  }

  function makeRemoveRowHandler(
    setRows: React.Dispatch<React.SetStateAction<KeyValueRow[]>>
  ): (index: number) => void {
    return index => {
      setRows(prev => {
        const next = prev.filter((_, i) => i !== index);
        return next.length > 0 ? next : [newRow()];
      });
    };
  }

  function makeToggleRemovalHandler(
    setKeys: React.Dispatch<React.SetStateAction<Set<string>>>
  ): (key: string) => void {
    return key => {
      setKeys(prev => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    };
  }

  function buildChanges() {
    const labelsToAdd: Record<string, string> = {};
    for (const row of labelRows) {
      if (row.key.trim() && !rowHasError(row, validateLabelValue, labelDuplicateKeys)) {
        labelsToAdd[row.key.trim()] = row.value;
      }
    }
    const annotationsToAdd: Record<string, string> = {};
    for (const row of annotationRows) {
      if (row.key.trim() && !rowHasError(row, validateAnnotationValue, annotationDuplicateKeys)) {
        annotationsToAdd[row.key.trim()] = row.value;
      }
    }
    const labelAddKeys = new Set(Object.keys(labelsToAdd));
    const annotationAddKeys = new Set(Object.keys(annotationsToAdd));
    // If a key appears in both add and remove, "add" wins — drop it from the remove list.
    // Compare using the raw existing key; add keys are already normalized (trimmed) when built above.
    const labelsToRemove = Array.from(labelKeysToRemove).filter(k => !labelAddKeys.has(k));
    const annotationsToRemove = Array.from(annotationKeysToRemove).filter(
      k => !annotationAddKeys.has(k)
    );
    return { labelsToAdd, annotationsToAdd, labelsToRemove, annotationsToRemove };
  }

  async function applyMetadata(
    metadataPatch: Record<string, any>,
    targets: typeof authorizedItems
  ) {
    const results: PromiseSettledResult<unknown>[] = [];
    for (let i = 0; i < targets.length; i += MAX_CONCURRENT_PATCHES) {
      const batch = targets.slice(i, i + MAX_CONCURRENT_PATCHES);
      const batchResults = await Promise.allSettled(
        batch.map(item => item.patch({ metadata: metadataPatch }))
      );
      results.push(...batchResults);
    }
    const rejectedResults = results
      .map((result, index) => ({ result, item: targets[index] }))
      .filter(
        (entry): entry is { result: PromiseRejectedResult; item: (typeof targets)[number] } =>
          entry.result.status === 'rejected'
      );
    if (rejectedResults.length > 0) {
      const rejectedErrors = rejectedResults.map(({ result, item }) => ({
        itemName: item?.metadata?.name || t('translation|unknown resource'),
        error:
          result.reason?.message ??
          (result.reason !== null && result.reason !== undefined
            ? String(result.reason)
            : t('translation|Unknown error')),
      }));
      const successCount = results.length - rejectedErrors.length;
      const firstError = rejectedErrors[0].error;
      const allFailedNames = rejectedErrors.map(({ itemName }) => itemName);
      const failedNames =
        allFailedNames.length > MAX_NAMES_IN_ERROR_MESSAGE
          ? `${allFailedNames.slice(0, MAX_NAMES_IN_ERROR_MESSAGE).join(', ')}, ${t(
              'translation|and {{count}} more',
              { count: allFailedNames.length - MAX_NAMES_IN_ERROR_MESSAGE }
            )}`
          : allFailedNames.join(', ');
      console.error('Failed to update metadata for one or more resources', rejectedErrors);
      // Partial success: some items patched, some failed. Items that succeeded are not rolled back.
      if (successCount > 0) {
        throw new Error(
          t(
            'translation|Updated metadata for {{successCount}} of {{totalCount}} items. Failed: {{failedNames}}. Error: {{firstError}}',
            {
              successCount,
              totalCount: results.length,
              failedNames,
              firstError,
            }
          )
        );
      }
      throw new Error(
        t(
          'translation|Failed to update metadata for {{failedCount}} of {{totalCount}} items: {{failedNames}}. Error: {{firstError}}',
          {
            failedCount: rejectedErrors.length,
            totalCount: results.length,
            failedNames,
            firstError,
          }
        )
      );
    }
  }

  function handleApply() {
    const { labelsToAdd, annotationsToAdd, labelsToRemove, annotationsToRemove } = buildChanges();

    const hasLabelChanges = Object.keys(labelsToAdd).length > 0 || labelsToRemove.length > 0;
    const hasAnnotationChanges =
      Object.keys(annotationsToAdd).length > 0 || annotationsToRemove.length > 0;

    if (!hasLabelChanges && !hasAnnotationChanges) {
      handleClose();
      if (afterConfirm) {
        afterConfirm();
      }
      return;
    }

    // Build the metadata patch. clusterRequests.ts hardcodes Content-Type: application/merge-patch+json
    // for every patch() call (RFC 7396), regardless of resource kind. Under RFC 7396 a null value
    // removes the key from the map, which is exactly the semantics we rely on for key removal here.
    const metadataPatch: Record<string, any> = {};

    if (hasLabelChanges) {
      metadataPatch.labels = {
        ...labelsToRemove.reduce<Record<string, null>>((acc, k) => {
          acc[k] = null;
          return acc;
        }, {}),
        ...labelsToAdd,
      };
    }

    if (hasAnnotationChanges) {
      metadataPatch.annotations = {
        ...annotationsToRemove.reduce<Record<string, null>>((acc, k) => {
          acc[k] = null;
          return acc;
        }, {}),
        ...annotationsToAdd,
      };
    }

    const targets = authorizedItems;
    const count = targets.length;

    dispatch(
      clusterAction(() => applyMetadata(metadataPatch, targets), {
        startMessage: t('translation|Updating metadata for {{count}} items…', { count }),
        cancelledMessage: t('translation|Cancelled metadata update for {{count}} items.', {
          count,
        }),
        successMessage: t('translation|Updated metadata for {{count}} items.', { count }),
        errorMessage: '',
        cancelUrl: location.pathname,
        startUrl: location.pathname,
        errorUrl: location.pathname,
      })
    );

    // CONFIRMED means the user confirmed the dialog, not that the patch succeeded.
    // The cluster action runs asynchronously after this point; cancel, success, and
    // error outcomes are not surfaced as additional events. Plugin consumers that need
    // those outcomes should listen to the clusterAction redux state directly.
    dispatchEditMetadataEvent({
      resources: targets,
      changes: { labelsToAdd, labelsToRemove, annotationsToAdd, annotationsToRemove },
      status: EventStatus.CONFIRMED,
    });

    handleClose();

    if (afterConfirm) {
      afterConfirm();
    }
  }

  const noPermittedItems =
    !authChecksPending && !authQueriesDeferred && authorizedItems.length === 0;
  const noPermittedItemsInDialog = !authChecksPending && authorizedItems.length === 0;

  if (!items || items.length === 0) {
    return null;
  }

  if (noPermittedItems) {
    const noPermissionTitle = t(
      'translation|You do not have permission to edit metadata for any of the selected items.'
    );
    if (buttonStyle === 'menu') {
      return (
        <Tooltip title={noPermissionTitle}>
          <span>
            <MenuItem disabled>
              <ListItemIcon>
                <Icon icon="mdi:tag-multiple" />
              </ListItemIcon>
              <ListItemText>{t('translation|Edit metadata')}</ListItemText>
            </MenuItem>
          </span>
        </Tooltip>
      );
    }
    return (
      <Tooltip title={noPermissionTitle}>
        <span>
          <IconButton aria-label={t('translation|Edit metadata')} disabled size="medium">
            <Icon icon="mdi:tag-multiple" />
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  return (
    <>
      <ActionButton
        description={t('translation|Edit metadata')}
        buttonStyle={buttonStyle}
        onClick={handleOpen}
        icon="mdi:tag-multiple"
      />
      {openDialog && (
        <Dialog open={openDialog} onClose={handleClose} fullWidth maxWidth="sm">
          <DialogTitle>{t('translation|Edit metadata')}</DialogTitle>
          <DialogContent>
            {authChecksPending ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={32} />
              </Box>
            ) : noPermittedItemsInDialog ? (
              <Typography variant="body2" sx={{ py: 2 }}>
                {t(
                  'translation|You do not have permission to edit metadata for any of the selected items.'
                )}
              </Typography>
            ) : (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t('translation|Changes will be applied to {{count}} items:', {
                    count: authorizedItems.length,
                  })}
                </Typography>
                <Box
                  component="ul"
                  sx={{
                    mt: 0,
                    mb: 2,
                    pl: 3,
                    '& li': { typography: 'body2' },
                    maxHeight: '8rem',
                    overflowY: 'auto',
                  }}
                >
                  {authorizedItems.map(item => (
                    <li
                      key={
                        item.metadata?.uid ??
                        `${item.kind}/${item.metadata?.namespace}/${item.metadata?.name}`
                      }
                    >
                      {item.metadata?.name}
                    </li>
                  ))}
                </Box>
                <Tabs
                  value={activeTab}
                  onChange={(_e, v) => setActiveTab(v)}
                  aria-label={t('translation|Metadata type')}
                >
                  <Tab
                    label={t('translation|Labels')}
                    id="tab-labels"
                    aria-controls="tabpanel-labels"
                  />
                  <Tab
                    label={t('translation|Annotations')}
                    id="tab-annotations"
                    aria-controls="tabpanel-annotations"
                  />
                </Tabs>
                <Box
                  role="tabpanel"
                  hidden={activeTab !== 0}
                  id="tabpanel-labels"
                  aria-labelledby="tab-labels"
                >
                  <MetadataTabPanel
                    rows={labelRows}
                    keysToRemove={labelKeysToRemove}
                    existingKeyCounts={existingLabelCounts}
                    totalItems={authorizedItems.length}
                    onAddRow={() => setLabelRows(prev => [...prev, newRow()])}
                    onChangeRow={makeChangeRowHandler(setLabelRows)}
                    onRemoveRow={makeRemoveRowHandler(setLabelRows)}
                    onToggleKeyRemoval={makeToggleRemovalHandler(setLabelKeysToRemove)}
                    addUpdateLabel={t('translation|Add / update labels')}
                    addLabel={t('translation|Add label')}
                    removeLabel={t('translation|Remove labels')}
                    fieldName="label"
                    validateValue={validateLabelValue}
                    duplicateKeys={labelDuplicateKeys}
                  />
                </Box>
                <Box
                  role="tabpanel"
                  hidden={activeTab !== 1}
                  id="tabpanel-annotations"
                  aria-labelledby="tab-annotations"
                >
                  <MetadataTabPanel
                    rows={annotationRows}
                    keysToRemove={annotationKeysToRemove}
                    existingKeyCounts={existingAnnotationCounts}
                    totalItems={authorizedItems.length}
                    onAddRow={() => setAnnotationRows(prev => [...prev, newRow()])}
                    onChangeRow={makeChangeRowHandler(setAnnotationRows)}
                    onRemoveRow={makeRemoveRowHandler(setAnnotationRows)}
                    onToggleKeyRemoval={makeToggleRemovalHandler(setAnnotationKeysToRemove)}
                    addUpdateLabel={t('translation|Add / update annotations')}
                    addLabel={t('translation|Add annotation')}
                    removeLabel={t('translation|Remove annotations')}
                    fieldName="annotation"
                    validateValue={validateAnnotationValue}
                    duplicateKeys={annotationDuplicateKeys}
                  />
                </Box>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              aria-label="cancel-button"
              onClick={handleClose}
              color="secondary"
              variant="contained"
            >
              {t('translation|Cancel')}
            </Button>
            {!authChecksPending && !noPermittedItemsInDialog && (
              <Button
                aria-label="confirm-button"
                onClick={handleApply}
                variant="contained"
                color="primary"
                disabled={hasValidationErrors}
              >
                {t('translation|Apply to {{count}} items', { count: authorizedItems.length })}
              </Button>
            )}
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
