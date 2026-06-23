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
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useId } from '../../../../lib/util';
import {
  buildLabelRows,
  FieldLabel,
  FormTextField,
  labelMapsEqual,
  LabelRow,
  labelRowsToMap,
  nextLabelRowId,
} from './CreateResourceForm';

/** Props for {@link ContainerTextField}.
 *  Each entry in `value` represents a container spec with fields like
 *  `name`, `image`, `imagePullPolicy`, and `ports`. */
export interface ContainerTextFieldProps {
  /** Current list of container objects. */
  value: Record<string, any>[];
  /** Called with the updated container list when any container is added, removed, or edited. */
  onChange: (containers: Record<string, any>[]) => void;
  /** Group label displayed above the container rows. */
  label?: string;
  /** Marks the group as required (renders an asterisk after the label). */
  required?: boolean;
  /** Optional helper text shown via an info-icon tooltip next to the label. */
  helperText?: string;
}

const IMAGE_PULL_POLICIES = ['Always', 'IfNotPresent', 'Never'];

let containerRowIdCounter = 0;
const nextContainerRowId = () => `container-${++containerRowIdCounter}`;

/** Editable list of containers (name + image + pull policy per row).
 *  Fill in the bottom inputs and click + to add. Existing containers appear
 *  above as editable rows with × to remove. */
export function ContainerTextField(props: ContainerTextFieldProps) {
  const { value, onChange, label, required, helperText } = props;
  const { t } = useTranslation(['translation']);
  const groupLabelId = useId('container-group-');
  const safeValue = Array.isArray(value) ? value : [];
  const [rowIds, setRowIds] = React.useState<string[]>(() =>
    safeValue.map(() => nextContainerRowId())
  );

  // Keep row IDs in sync when value changes externally (e.g. YAML editor).
  React.useEffect(() => {
    setRowIds(prev => {
      if (prev.length === safeValue.length) return prev;
      if (prev.length < safeValue.length) {
        const next = [...prev];
        while (next.length < safeValue.length) {
          next.push(nextContainerRowId());
        }
        return next;
      }
      return prev.slice(0, safeValue.length);
    });
  }, [safeValue.length]);

  function handleAdd() {
    setRowIds(prev => [...prev, nextContainerRowId()]);
    onChange([
      ...safeValue,
      { name: '', image: '', ports: [{ containerPort: 80 }], imagePullPolicy: 'Always' },
    ]);
  }

  function handleRemove(index: number) {
    setRowIds(prev => prev.filter((_, i) => i !== index));
    onChange(safeValue.filter((_, i) => i !== index));
  }

  function handleEdit(index: number, field: string, newVal: string) {
    onChange(
      safeValue.map((c, i) => {
        if (i !== index) return c;
        if (field === 'containerPort') {
          const portNum = parseInt(newVal, 10);
          const rest = _.omit(c, ['containerPort', 'ports']);
          if (!isNaN(portNum) && portNum > 0) {
            return { ...rest, ports: [{ containerPort: portNum }] };
          }
          return rest;
        }
        return { ...c, [field]: newVal };
      })
    );
  }

  function getPort(container: Record<string, any>): string {
    const port = container?.ports?.[0]?.containerPort ?? container?.containerPort;
    return port !== null && port !== undefined ? String(port) : '';
  }

  return (
    <Box role="group" aria-labelledby={groupLabelId}>
      {(label || helperText) && (
        <FieldLabel id={groupLabelId} label={label} required={required} helperText={helperText} />
      )}
      {safeValue.map((rawContainer, index) => {
        const container =
          rawContainer && typeof rawContainer === 'object' && !Array.isArray(rawContainer)
            ? (rawContainer as Record<string, any>)
            : {};
        return (
          <Box
            key={rowIds[index] ?? `container-fallback-${index}`}
            sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}
          >
            <FormTextField
              label={t('translation|Name')}
              value={container.name ?? ''}
              onChange={e => handleEdit(index, 'name', e.target.value)}
              inputProps={{ 'aria-label': t('translation|Container name') }}
            />
            <FormTextField
              label={t('translation|Image')}
              value={container.image ?? ''}
              onChange={e => handleEdit(index, 'image', e.target.value)}
              inputProps={{ 'aria-label': t('translation|Container image') }}
            />
            <FormTextField
              label={t('translation|Container Port')}
              value={getPort(container)}
              onChange={e => handleEdit(index, 'containerPort', e.target.value)}
              inputProps={{ 'aria-label': t('translation|Container port') }}
              type="number"
            />
            <FormTextField
              label={t('translation|Pull Policy')}
              value={container.imagePullPolicy ?? 'Always'}
              onChange={e => handleEdit(index, 'imagePullPolicy', e.target.value)}
              inputProps={{ 'aria-label': t('translation|Image pull policy') }}
              select
            >
              {IMAGE_PULL_POLICIES.map(p => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </FormTextField>
            <IconButton
              onClick={() => handleRemove(index)}
              color="default"
              size="small"
              aria-label={t('translation|Remove container {{ name }}', {
                name: container.name ?? index,
              })}
            >
              <Icon icon="mdi:close-circle" width={24} height={24} />
            </IconButton>
          </Box>
        );
      })}
      <Box sx={{ mt: 2 }}>
        <Button
          onClick={handleAdd}
          color="primary"
          size="small"
          aria-label={t('translation|Add container')}
        >
          <Icon icon="mdi:plus-circle" width={24} height={24} />
          <Typography variant="body2" sx={{ ml: 0.5 }}>
            {t('translation|New Container')}
          </Typography>
        </Button>
      </Box>
    </Box>
  );
}

export interface PodLabelsEditorProps {
  /** Current full pod template labels map (locked entries + extras). */
  value: Record<string, string>;
  /** Labels mirrored from the selector. Rendered disabled with no delete. */
  lockedLabels: Record<string, string>;
  /** Called with the updated full pod template labels map. */
  onChange: (labels: Record<string, string>) => void;
}

/** Pod template labels editor. Rows whose key is in `lockedLabels` (mirrored
 *  from the selector) render disabled with no delete. Other rows are fully
 *  editable; both end up in `spec.template.metadata.labels`. */
export function PodLabelsEditor(props: PodLabelsEditorProps) {
  const { value, lockedLabels, onChange } = props;
  const { t } = useTranslation(['translation']);

  /** Editable rows = full value minus locked keys. */
  function extrasFromValue(full: Record<string, string>): Record<string, string> {
    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries(full ?? {})) {
      if (!(k in lockedLabels)) extras[k] = v;
    }
    return extras;
  }

  const [extraRows, setExtraRows] = React.useState<LabelRow[]>(() =>
    buildLabelRows(extrasFromValue(value))
  );
  /** Last full map we emitted. Lets us tell our own echo apart from an
   *  outside change (e.g. YAML editor) and re-seed rows only when needed. */
  const lastEmittedRef = React.useRef<Record<string, string>>({
    ...lockedLabels,
    ...labelRowsToMap(extraRows),
  });

  React.useEffect(() => {
    const merged = { ...lockedLabels, ...value };
    if (!labelMapsEqual(merged, lastEmittedRef.current)) {
      setExtraRows(buildLabelRows(extrasFromValue(value ?? {})));
      lastEmittedRef.current = merged;
    }
    // extrasFromValue closes over lockedLabels; both are in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lockedLabels]);

  function commit(nextExtras: LabelRow[]) {
    setExtraRows(nextExtras);
    const extrasMap = labelRowsToMap(nextExtras);
    // Locked entries win on key collision so selector edits aren't
    // shadowed by a same-key extra.
    const full = { ...extrasMap, ...lockedLabels };
    lastEmittedRef.current = full;
    onChange(full);
  }

  function addRow() {
    const used = new Set([...extraRows.map(r => r.key), ...Object.keys(lockedLabels)]);
    let nextKey = 'new-label';
    let idx = 1;
    while (used.has(nextKey)) {
      idx += 1;
      nextKey = `new-label-${idx}`;
    }
    commit([...extraRows, { id: nextLabelRowId(), key: nextKey, value: '' }]);
  }

  function handleDelete(id: string) {
    commit(extraRows.filter(r => r.id !== id));
  }

  function handleKeyEdit(id: string, newKeyVal: string) {
    commit(extraRows.map(r => (r.id === id ? { ...r, key: newKeyVal } : r)));
  }

  function handleValueEdit(id: string, newValue: string) {
    commit(extraRows.map(r => (r.id === id ? { ...r, value: newValue } : r)));
  }

  const lockedEntries = Object.entries(lockedLabels ?? {});

  return (
    <Box>
      {lockedEntries.map(([k, v]) => (
        <Box
          key={`locked-${k}`}
          sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}
        >
          <FormTextField
            label={t('translation|Key')}
            value={k}
            disabled
            inputProps={{ 'aria-label': t('translation|Label key'), readOnly: true }}
          />
          <FormTextField
            label={t('translation|Value')}
            value={v}
            disabled
            inputProps={{ 'aria-label': t('translation|Label value'), readOnly: true }}
          />
        </Box>
      ))}
      {extraRows.map(r => (
        <Box key={r.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}>
          <FormTextField
            label={t('translation|Key')}
            value={r.key}
            onChange={e => handleKeyEdit(r.id, e.target.value)}
            inputProps={{ 'aria-label': t('translation|Label key') }}
          />
          <FormTextField
            label={t('translation|Value')}
            value={r.value}
            onChange={e => handleValueEdit(r.id, e.target.value)}
            inputProps={{ 'aria-label': t('translation|Label value') }}
          />
          <IconButton
            onClick={() => handleDelete(r.id)}
            color="default"
            size="small"
            aria-label={t('translation|Remove label {{ label }}', {
              label: `${r.key}=${r.value}`,
            })}
          >
            <Icon icon="mdi:close-circle" width={24} height={24} />
          </IconButton>
        </Box>
      ))}
      <Box sx={{ mt: 2 }}>
        <Button
          onClick={addRow}
          color="primary"
          size="small"
          aria-label={t('translation|Add label')}
        >
          <Icon icon="mdi:plus-circle" width={24} height={24} />
          <Typography variant="body2" sx={{ ml: 0.5 }}>
            {t('translation|New Label')}
          </Typography>
        </Button>
      </Box>
    </Box>
  );
}
