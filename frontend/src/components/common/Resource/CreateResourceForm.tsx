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
  type?: 'text' | 'labels' | 'select' | 'containers' | 'namespace';
  /** Whether the field is required. */
  required?: boolean;
  /** Helper text displayed below the field. */
  helperText?: string;
  /** Options for 'select' type fields. */
  options?: SelectOption[];
  /** Extra top margin (theme spacing units) to visually separate from the field above. */
  spacingTop?: number;
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
    _.set(updated, path, value);
    onChange(updated);
  }

  function renderField(field: FormField) {
    const value = _.get(resource, field.path);

    switch (field.type) {
      case 'labels':
        return (
          <LabelTextField
            label={field.label}
            value={value ?? {}}
            onChange={labels => handleFieldChange(field.path, labels)}
          />
        );
      case 'containers':
        return (
          <ContainerTextField
            label={field.label}
            value={value ?? []}
            onChange={containers => handleFieldChange(field.path, containers)}
          />
        );
      case 'namespace':
        return (
          <NamespaceTextField
            label={field.label}
            value={value ?? ''}
            onChange={ns => handleFieldChange(field.path, ns)}
            required={field.required}
            helperText={field.helperText}
          />
        );
      case 'select':
        return (
          <FormTextField
            label={field.label}
            value={value ?? ''}
            onChange={e => handleFieldChange(field.path, e.target.value)}
            required={field.required}
            helperText={field.helperText}
            select
          >
            {(field.options ?? []).map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </FormTextField>
        );
      default:
        return (
          <FormTextField
            label={field.label}
            value={value ?? ''}
            onChange={e => handleFieldChange(field.path, e.target.value)}
            required={field.required}
            helperText={field.helperText}
          />
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

export interface NamespaceTextFieldProps {
  value: string;
  onChange: (namespace: string) => void;
  label?: string;
  required?: boolean;
  helperText?: string;
}

/** Autocomplete namespace selector that fetches existing namespaces from the cluster. */
export function NamespaceTextField(props: NamespaceTextFieldProps) {
  const { value, onChange, label, required, helperText } = props;
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
          label={label}
          required={required}
          helperText={helperText}
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
}

/** Editable key/value rows for Kubernetes labels.
 *  Existing labels are shown as editable rows. Click + New Label to add a placeholder row. */
export function LabelTextField(props: LabelTextFieldProps) {
  const { value, onChange, label } = props;
  const { t } = useTranslation(['translation']);
  const groupLabelId = useId('label-group-');
  const entries = Object.entries(value);
  const [rowIds, setRowIds] = React.useState<string[]>(() => entries.map(() => nextLabelRowId()));

  // Keep row IDs in sync when value changes externally (e.g. YAML editor) or
  // when rows are added/removed locally. Renames keep the existing id at the
  // same index, so the input doesn't remount and lose focus mid-edit.
  React.useEffect(() => {
    setRowIds(prev => {
      if (prev.length === entries.length) return prev;
      if (prev.length < entries.length) {
        const next = [...prev];
        while (next.length < entries.length) {
          next.push(nextLabelRowId());
        }
        return next;
      }
      return prev.slice(0, entries.length);
    });
  }, [entries.length]);

  function addLabel() {
    const baseKey = 'new-label';
    let nextKey = baseKey;
    let idx = 1;

    while (Object.prototype.hasOwnProperty.call(value, nextKey)) {
      idx += 1;
      nextKey = `${baseKey}-${idx}`;
    }

    onChange({ ...value, [nextKey]: '' });
  }

  function handleDelete(labelKey: string) {
    const next = { ...value };
    delete next[labelKey];
    onChange(next);
  }

  function handleKeyEdit(oldKey: string, newKeyVal: string) {
    if (newKeyVal === oldKey) {
      return;
    }

    // Block renames that would collide with another existing key (which would
    // silently overwrite its value). An empty key is allowed mid-edit so the
    // user can clear the field and type a replacement.
    if (newKeyVal && Object.prototype.hasOwnProperty.call(value, newKeyVal)) {
      return;
    }

    const entries = Object.entries(value);
    const result: Record<string, string> = {};
    for (const [k, v] of entries) {
      if (k === oldKey) {
        result[newKeyVal] = v;
      } else {
        result[k] = v;
      }
    }
    onChange(result);
  }

  function handleValueEdit(labelKey: string, newValue: string) {
    onChange({ ...value, [labelKey]: newValue });
  }

  return (
    <Box role="group" aria-labelledby={groupLabelId}>
      {label && (
        <Typography id={groupLabelId} variant="body2" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
      )}
      {entries.map(([k, v], index) => (
        <Box
          key={rowIds[index] ?? `label-${index}`}
          sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2, mb: 2 }}
        >
          <FormTextField
            label={t('translation|Key')}
            value={k}
            onChange={e => handleKeyEdit(k, e.target.value)}
            inputProps={{ 'aria-label': t('translation|Label key') }}
          />
          <FormTextField
            label={t('translation|Value')}
            value={v}
            onChange={e => handleValueEdit(k, e.target.value)}
            inputProps={{ 'aria-label': t('translation|Label value') }}
          />
          <IconButton
            onClick={() => handleDelete(k)}
            color="default"
            size="small"
            aria-label={t('translation|Remove label {{ label }}', { label: `${k}=${v}` })}
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
}

const IMAGE_PULL_POLICIES = ['Always', 'IfNotPresent', 'Never'];

let containerRowIdCounter = 0;
const nextContainerRowId = () => `container-${++containerRowIdCounter}`;

let labelRowIdCounter = 0;
const nextLabelRowId = () => `label-${++labelRowIdCounter}`;

/** Editable list of containers (name + image + pull policy per row).
 *  Fill in the bottom inputs and click + to add. Existing containers appear
 *  above as editable rows with × to remove. */
export function ContainerTextField(props: ContainerTextFieldProps) {
  const { value, onChange, label } = props;
  const { t } = useTranslation(['translation']);
  const groupLabelId = useId('container-group-');
  const [rowIds, setRowIds] = React.useState<string[]>(() => value.map(() => nextContainerRowId()));

  // Keep row IDs in sync when value changes externally (e.g. YAML editor).
  React.useEffect(() => {
    setRowIds(prev => {
      if (prev.length === value.length) return prev;
      if (prev.length < value.length) {
        const next = [...prev];
        while (next.length < value.length) {
          next.push(nextContainerRowId());
        }
        return next;
      }
      return prev.slice(0, value.length);
    });
  }, [value.length]);

  function handleAdd() {
    setRowIds(prev => [...prev, nextContainerRowId()]);
    onChange([
      ...value,
      { name: '', image: '', ports: [{ containerPort: 80 }], imagePullPolicy: 'Always' },
    ]);
  }

  function handleRemove(index: number) {
    setRowIds(prev => prev.filter((_, i) => i !== index));
    onChange(value.filter((_, i) => i !== index));
  }

  function handleEdit(index: number, field: string, newVal: string) {
    onChange(
      value.map((c, i) => {
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
    const port = container?.ports?.[0]?.containerPort ?? container.containerPort;
    return port !== null && port !== undefined ? String(port) : '';
  }

  return (
    <Box role="group" aria-labelledby={groupLabelId}>
      {label && (
        <Typography id={groupLabelId} variant="body2" sx={{ mb: 0.5 }}>
          {label}
        </Typography>
      )}
      {value.map((container, index) => (
        <Box
          key={rowIds[index] ?? `container-${index}`}
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
      ))}
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
