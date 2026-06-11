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
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField, { TextFieldProps } from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import * as yaml from 'js-yaml';
import _ from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import Namespace from '../../../lib/k8s/namespace';
import { useId } from '../../../lib/util';

/** An option for a select field. */
export interface SelectOption {
  /** The value stored in the resource object. */
  value: string;
  /** Display label shown in the dropdown. */
  label: string;
}

/** A single field within a form section. */
export interface FormField {
  /** Unique key for this field. */
  key: string;
  /** Dot-notation path in the resource object, e.g. "metadata.name". */
  path: string;
  /** Display label for the field. */
  label: string;
  /** Input type – defaults to 'text'. */
  type?: 'text' | 'number' | 'labels' | 'select' | 'containers' | 'namespace';
  /** Whether the field is required. */
  required?: boolean;
  /** For 'number' fields: minimum allowed value. */
  min?: number;
  /** For 'number' fields: render the label inline to the left of a compact input. */
  inline?: boolean;
  /** Helper text displayed below the field. */
  helperText?: string;
  /** Options for 'select' type fields. */
  options?: SelectOption[];
  /** Extra top margin (theme spacing units) to visually separate from the field above. */
  spacingTop?: number;
  /** Optional custom renderer. When provided, this replaces the built-in input
   *  for the field's `type` and is given the current value at `path`, a setter
   *  that updates the resource at `path`, and the full resource object for
   *  cross-field validation. The wrapping section still renders the FieldLabel
   *  (label + helper-text tooltip) above the custom UI. */
  render?: (args: {
    value: any;
    onChange: (value: any) => void;
    resource: Record<string, any>;
  }) => React.ReactNode;
}

/** A labelled group of fields. */
export interface FormSection {
  /** Section heading displayed above the fields. */
  title: string;
  /** Fields rendered inside this section. */
  fields: FormField[];
}

/** Props for {@link CreateResourceForm}. */
export interface CreateResourceFormProps {
  /** Sections containing the form field descriptors. */
  sections: FormSection[];
  /** The resource as a plain JS object. */
  resource: Record<string, any>;
  /** Called with the updated resource object when any field changes. */
  onChange: (resource: Record<string, any>) => void;
}

/** Data-driven resource creation form. Renders labelled sections of typed
 *  fields (text, labels, containers, namespace, select) from a declarative
 *  descriptor and keeps a plain JS resource object in sync via `onChange`. */
export default function CreateResourceForm(props: CreateResourceFormProps) {
  const { sections, resource, onChange } = props;
  const { t } = useTranslation(['translation']);

  function handleFieldChange(path: string, value: any) {
    const updated = _.cloneDeep(resource);
    if (value === undefined) {
      _.unset(updated, path);
    } else {
      _.set(updated, path, value);
    }
    onChange(updated);
  }

  /** Handle a number input change. Empty clears the value. Only whole
   *  numbers within `field.min` are saved. `0` is allowed. */
  function handleNumberChange(field: FormField, raw: string) {
    if (raw === '') {
      handleFieldChange(field.path, undefined);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return;
    }
    if (field.min !== undefined && parsed < field.min) {
      return;
    }
    handleFieldChange(field.path, parsed);
  }

  function renderField(field: FormField) {
    const value = _.get(resource, field.path);

    if (field.render) {
      return (
        <Box>
          <FieldLabel label={field.label} required={field.required} helperText={field.helperText} />
          {field.render({
            value,
            onChange: v => handleFieldChange(field.path, v),
            resource,
          })}
        </Box>
      );
    }

    switch (field.type) {
      case 'labels':
        return (
          <LabelTextField
            label={field.label}
            required={field.required}
            helperText={field.helperText}
            value={value ?? {}}
            onChange={labels => handleFieldChange(field.path, labels)}
          />
        );
      case 'containers':
        return (
          <ContainerTextField
            label={field.label}
            required={field.required}
            helperText={field.helperText}
            value={value ?? []}
            onChange={containers => handleFieldChange(field.path, containers)}
          />
        );
      case 'namespace':
        return (
          <Box>
            <FieldLabel
              label={field.label}
              required={field.required}
              helperText={field.helperText}
            />
            <NamespaceTextField
              value={value ?? ''}
              onChange={ns => handleFieldChange(field.path, ns)}
              required={field.required}
            />
          </Box>
        );
      case 'number':
        if (field.inline) {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <FieldLabel
                label={field.label}
                required={field.required}
                helperText={field.helperText}
                sx={{ minWidth: 120, mb: 0 }}
              />
              <Box sx={{ width: 120 }}>
                <FormTextField
                  value={value ?? ''}
                  onChange={e => handleNumberChange(field, e.target.value)}
                  required={field.required}
                  type="number"
                  inputProps={{
                    'aria-label': field.label,
                    step: 1,
                    ...(field.min !== undefined ? { min: field.min } : {}),
                  }}
                />
              </Box>
            </Box>
          );
        }
        return (
          <Box>
            <FieldLabel
              label={field.label}
              required={field.required}
              helperText={field.helperText}
            />
            <FormTextField
              value={value ?? ''}
              onChange={e => handleNumberChange(field, e.target.value)}
              required={field.required}
              type="number"
              inputProps={{
                'aria-label': field.label,
                step: 1,
                ...(field.min !== undefined ? { min: field.min } : {}),
              }}
            />
          </Box>
        );
      case 'select':
        return (
          <Box>
            <FieldLabel
              label={field.label}
              required={field.required}
              helperText={field.helperText}
            />
            <FormTextField
              value={value ?? ''}
              onChange={e => handleFieldChange(field.path, e.target.value)}
              required={field.required}
              select
              inputProps={{ 'aria-label': field.label }}
            >
              {(field.options ?? []).map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </FormTextField>
          </Box>
        );
      default:
        return (
          <Box>
            <FieldLabel
              label={field.label}
              required={field.required}
              helperText={field.helperText}
            />
            <FormTextField
              value={value ?? ''}
              onChange={e => handleFieldChange(field.path, e.target.value)}
              required={field.required}
              inputProps={{ 'aria-label': field.label }}
            />
          </Box>
        );
    }
  }

  return (
    <Box
      sx={{
        height: '100%',
        overflowY: 'auto',
        width: '100%',
      }}
    >
      <Box
        aria-label={t('translation|Resource form')}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'center',
          gap: 3,
          pt: 2,
          marginLeft: 5,
          maxWidth: '80%',
        }}
      >
        {sections.map(section => (
          <Box component="fieldset" key={section.title} sx={{ border: 'none', m: 0, p: 0 }}>
            <Typography component="legend" variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
              {section.title}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pl: 1 }}>
              {section.fields.map(field => (
                <Box key={field.key} sx={field.spacingTop ? { mt: field.spacingTop } : undefined}>
                  {renderField(field)}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Pre-styled outlined TextField matching the app's search input style. */
export function FormTextField(props: TextFieldProps) {
  return (
    <TextField
      variant="outlined"
      size="small"
      fullWidth
      InputProps={{
        sx: theme => ({ background: theme.palette.background.default }),
      }}
      {...props}
    />
  );
}

export interface FieldLabelProps {
  /** Visible label text. */
  label?: string;
  /** Adds an asterisk after the label when true. */
  required?: boolean;
  /** When set, an info icon button is rendered next to the label and the text
   *  is shown in a tooltip on hover/focus. */
  helperText?: string;
  /** Optional `for` attribute, when the label labels a single input by id. */
  htmlFor?: string;
  /** Optional id, useful with `aria-labelledby`. */
  id?: string;
  /** Override sx for the wrapper Box. */
  sx?: React.ComponentProps<typeof Box>['sx'];
}

/** Field label with an optional info-icon tooltip for `helperText`. */
export function FieldLabel(props: FieldLabelProps) {
  const { label, required, helperText, htmlFor, id, sx } = props;
  if (!label && !helperText) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, ...sx }}>
      {label && (
        <Typography
          id={id}
          component={htmlFor ? 'label' : 'span'}
          // htmlFor is only valid on label elements.
          {...(htmlFor ? ({ htmlFor } as any) : {})}
          variant="body2"
          sx={{ lineHeight: 1 }}
        >
          {label}
          {required ? ' *' : ''}
        </Typography>
      )}
      {helperText && (
        <Tooltip title={helperText} arrow>
          <IconButton
            size="small"
            aria-label={helperText}
            sx={{ p: 0, display: 'inline-flex', lineHeight: 0 }}
          >
            <Icon
              icon="mdi:information-outline"
              width={16}
              height={16}
              style={{ display: 'block' }}
            />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export interface NamespaceTextFieldProps {
  value: string;
  onChange: (namespace: string) => void;
  label?: string;
  required?: boolean;
  helperText?: string;
}

/** Autocomplete namespace selector that fetches existing namespaces from the cluster. */
export function NamespaceTextField(props: NamespaceTextFieldProps) {
  const { value, onChange, required } = props;
  const [namespaces] = Namespace.useList();
  const options = React.useMemo(
    () => (namespaces ?? []).map(ns => ns.metadata.name).sort(),
    [namespaces]
  );

  return (
    <Autocomplete
      freeSolo
      options={options}
      value={value}
      onChange={(_event, newValue) => {
        onChange(newValue ?? '');
      }}
      onInputChange={(_event, newInputValue, reason) => {
        if (reason === 'input') {
          onChange(newInputValue);
        }
      }}
      renderInput={params => (
        <TextField
          {...params}
          variant="outlined"
          size="small"
          fullWidth
          required={required}
          InputProps={{
            ...params.InputProps,
            sx: theme => ({ background: theme.palette.background.default }),
          }}
        />
      )}
    />
  );
}

export interface LabelTextFieldProps {
  /** Current label map. */
  value: Record<string, string>;
  /** Called with the updated label map when labels change. */
  onChange: (labels: Record<string, string>) => void;
  /** Input label text. */
  label?: string;
  /** Marks the group as required (renders an asterisk after the label). */
  required?: boolean;
  /** Optional helper text shown via an info-icon tooltip next to the label. */
  helperText?: string;
}

export function LabelTextField(props: LabelTextFieldProps) {
  const { value, onChange, label, required, helperText } = props;
  const { t } = useTranslation(['translation']);
  const groupLabelId = useId('label-group-');

  const [rows, setRows] = React.useState<LabelRow[]>(() => buildLabelRows(value));
  // Tracks the map we most recently sent to the parent so we can distinguish
  // an external value change (e.g. YAML editor) from the echo of our own
  // onChange and avoid blowing away in-progress edits.
  const lastEmittedRef = React.useRef<Record<string, string>>(labelRowsToMap(rows));

  React.useEffect(() => {
    const incoming = value ?? {};
    if (!labelMapsEqual(incoming, lastEmittedRef.current)) {
      setRows(buildLabelRows(incoming));
      lastEmittedRef.current = incoming;
    }
  }, [value]);

  function commit(next: LabelRow[]) {
    setRows(next);
    const map = labelRowsToMap(next);
    lastEmittedRef.current = map;
    onChange(map);
  }

  function addLabel() {
    const used = new Set(rows.map(r => r.key));
    let nextKey = 'new-label';
    let idx = 1;
    while (used.has(nextKey)) {
      idx += 1;
      nextKey = `new-label-${idx}`;
    }
    commit([...rows, { id: nextLabelRowId(), key: nextKey, value: '' }]);
  }

  function handleDelete(id: string) {
    commit(rows.filter(r => r.id !== id));
  }

  function handleKeyEdit(id: string, newKeyVal: string) {
    // Allow transient collisions with another row's key — blocking them
    // here would trap the user mid-edit (e.g. backspacing 'new-label-2'
    // down to 'new-label' when row 1 is already 'new-label'). The map
    // serializer dedupes first-wins, so the resource stays valid until the
    // keys diverge again.
    commit(rows.map(r => (r.id === id ? { ...r, key: newKeyVal } : r)));
  }

  function handleValueEdit(id: string, newValue: string) {
    commit(rows.map(r => (r.id === id ? { ...r, value: newValue } : r)));
  }

  return (
    <Box role="group" aria-labelledby={groupLabelId}>
      {(label || helperText) && (
        <FieldLabel id={groupLabelId} label={label} required={required} helperText={helperText} />
      )}
      {rows.map(r => (
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
          onClick={addLabel}
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

let labelRowIdCounter = 0;
const nextLabelRowId = () => `label-${++labelRowIdCounter}`;

/** A single row in a labels editor. */
export interface LabelRow {
  id: string;
  key: string;
  value: string;
}

/** Build the editor's internal rows from a Kubernetes labels map. Insertion
 *  order is preserved so the YAML and the form stay visually aligned. */
export function buildLabelRows(map: Record<string, string> | undefined): LabelRow[] {
  return Object.entries(map ?? {}).map(([k, v]) => ({
    id: nextLabelRowId(),
    key: k,
    value: v,
  }));
}

/** Turn editor rows back into a labels map. Empty keys are skipped, and on
 *  duplicate keys the first row wins. */
export function labelRowsToMap(rows: LabelRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (r.key && !Object.prototype.hasOwnProperty.call(out, r.key)) {
      out[r.key] = r.value;
    }
  }
  return out;
}

/** Shallow equality on labels maps (same keys, same string values). */
export function labelMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

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

/** Props for {@link PodLabelsEditor}. */
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
    // Two rows may briefly share a key while typing; the map drops the duplicate.
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

/** Options for {@link useSelectorPodTemplate}. */
export interface UseSelectorPodTemplateOptions<T extends Record<string, any>> {
  /** Current resource draft. */
  resource: T;
  /** Called when the resource is updated (defaults seeded, selector edited). */
  onChange: (resource: T) => void;
  /** Label seeded into `spec.selector.matchLabels` and mirrored into the pod
   *  template when the selector is empty on first mount. Defaults to
   *  `{ app: 'headlamp' }`. Pass `null` to skip seeding labels. */
  defaultMatchLabels?: Record<string, string> | null;
  /** Value seeded into `spec.replicas` when unset on first mount. Defaults
   *  to `1`. Pass `null` to skip seeding replicas (useful for DaemonSet,
   *  Job, etc. which don't take a replica count). */
  defaultReplicas?: number | null;
}

/** Returned by {@link useSelectorPodTemplate}. */
export interface SelectorPodTemplateState {
  /** Current `spec.selector.matchLabels`. */
  matchLabels: Record<string, string>;
  /** Current `spec.template.metadata.labels`. */
  podLabels: Record<string, string>;
  /** Apply a new selector map. Old selector entries are replaced with
   *  `nextMatch`; any pod-template-only extras are preserved. Selector wins
   *  on key collision, matching {@link PodLabelsEditor}. */
  handleMatchLabelsChange: (nextMatch: Record<string, string>) => void;
}

/** Shared selector + pod-template wiring for resources that embed a pod
 *  template (Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, ...).
 *  Seeds defaults once on mount and exposes a selector change handler that
 *  mirrors selector entries into the pod template labels.
 *
 *  Opt-in: only call this from forms that actually have a selector + pod
 *  template. Pair with {@link LabelTextField} for the selector field and
 *  {@link PodLabelsEditor} for the pod template labels field, both via the
 *  `render` callback on a {@link FormField}. */
export function useSelectorPodTemplate<T extends Record<string, any>>(
  opts: UseSelectorPodTemplateOptions<T>
): SelectorPodTemplateState {
  const {
    resource,
    onChange,
    defaultMatchLabels = { app: 'headlamp' },
    defaultReplicas = 1,
  } = opts;

  const matchLabels = React.useMemo(
    () => (resource.spec?.selector?.matchLabels as Record<string, string> | undefined) ?? {},
    [resource.spec?.selector?.matchLabels]
  );
  const podLabels =
    (resource.spec?.template?.metadata?.labels as Record<string, string> | undefined) ?? {};

  // Seed defaults once. Effect (not render) so the seed reaches the
  // resource / YAML, not just the form UI.
  const didSeedDefaultsRef = React.useRef(false);
  React.useEffect(() => {
    if (didSeedDefaultsRef.current) return;
    didSeedDefaultsRef.current = true;
    const next = _.cloneDeep(resource) as T;
    let changed = false;
    if (defaultMatchLabels !== null) {
      if (Object.keys(matchLabels).length === 0) {
        _.set(next, 'spec.selector.matchLabels', { ...defaultMatchLabels });
        _.set(next, 'spec.template.metadata.labels', {
          ...((next.spec?.template?.metadata?.labels as Record<string, string> | undefined) ?? {}),
          ...defaultMatchLabels,
        });
        changed = true;
      } else {
        // Mirror every selector entry into pod labels, keeping existing extras.
        const mergedPodLabels = { ...podLabels, ...matchLabels };
        if (!labelMapsEqual(mergedPodLabels, podLabels)) {
          _.set(next, 'spec.template.metadata.labels', mergedPodLabels);
          changed = true;
        }
      }
    }
    if (defaultReplicas !== null && next.spec?.replicas === undefined) {
      _.set(next, 'spec.replicas', defaultReplicas);
      changed = true;
    }
    if (changed) {
      onChange(next);
    }
    // Only run once: re-running would clobber user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMatchLabelsChange(nextMatch: Record<string, string>) {
    const extras: Record<string, string> = {};
    for (const [k, v] of Object.entries(podLabels)) {
      if (!(k in matchLabels)) extras[k] = v;
    }
    const nextPodLabels = { ...extras, ...nextMatch };

    const nextResource = _.cloneDeep(resource) as T;
    _.set(nextResource, 'spec.selector.matchLabels', nextMatch);
    if (!labelMapsEqual(nextPodLabels, podLabels)) {
      _.set(nextResource, 'spec.template.metadata.labels', nextPodLabels);
    }
    onChange(nextResource);
  }

  return { matchLabels, podLabels, handleMatchLabelsChange };
}

/** Safely parse a YAML string into an object, returning {} on failure. */
export function parseYaml(input: string | undefined): Record<string, any> {
  if (!input) return {};
  try {
    const parsed = yaml.load(input);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/** Convert a labels map to a display string, e.g. `{a: "1", b: "2"}` → `"a=1, b=2"`. */
export function labelsToString(labels: Record<string, string> | undefined): string {
  if (!labels || typeof labels !== 'object') return '';
  return Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

/** Parse a comma-separated `key=value` string into a labels map. */
export function parseLabelsString(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!input.trim()) return result;
  input.split(',').forEach(pair => {
    const [key, ...rest] = pair.split('=');
    const k = key.trim();
    const v = rest.join('=').trim();
    if (k) {
      result[k] = v;
    }
  });
  return result;
}

/** Serialize a JS value to a YAML string using js-yaml. */
export function toYamlString(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  return yaml.dump(obj, { indent: 2, lineWidth: -1, noRefs: true });
}
