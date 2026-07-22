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

import Box from '@mui/material/Box';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import React from 'react';
import { useTranslation } from 'react-i18next';
import CreateResourceForm, {
  FormSection,
  FormTextField,
} from '../common/Resource/CreateResourceForm';

/** Props for CreatePVCForm */
export interface CreatePVCFormProps {
  resource?: Record<string, any>;
  onChange: (resource: Record<string, any>) => void;
  onValidChange?: (valid: boolean) => void;
}

type StorageClassMode = 'default' | 'specify' | 'none';

function modeFromValue(v: string | null | undefined): StorageClassMode {
  if (v === undefined || v === null) return 'default';
  if (v === '') return 'none';
  return 'specify';
}

interface StorageClassFieldProps {
  value: string | null | undefined;
  onChange: (value: string | undefined) => void;
}

function StorageClassField({ value, onChange }: StorageClassFieldProps) {
  const { t } = useTranslation(['translation', 'glossary']);
  const [mode, setMode] = React.useState<StorageClassMode>(() => modeFromValue(value));
  const lastEmittedRef = React.useRef<string | null | undefined>(value);

  React.useEffect(() => {
    if (value !== lastEmittedRef.current) {
      lastEmittedRef.current = value;
      setMode(modeFromValue(value));
    }
  }, [value]);

  function handleModeChange(newMode: StorageClassMode) {
    setMode(newMode);
    if (newMode === 'specify') {
      if (value === '') {
        lastEmittedRef.current = undefined;
        onChange(undefined);
      }
      return;
    }
    const newValue = newMode === 'none' ? '' : undefined;
    lastEmittedRef.current = newValue;
    onChange(newValue);
  }

  function handleSpecifyChange(v: string) {
    const newValue = v.trim();
    if (newValue === '') {
      setMode('default');
      lastEmittedRef.current = undefined;
      onChange(undefined);
      return;
    }
    lastEmittedRef.current = newValue;
    onChange(newValue);
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <RadioGroup
        aria-label={t('glossary|Storage Class')}
        value={mode}
        onChange={e => handleModeChange(e.target.value as StorageClassMode)}
      >
        <FormControlLabel
          value="default"
          control={<Radio size="small" />}
          label={t('translation|Use default StorageClass')}
        />
        <FormControlLabel
          value="none"
          control={<Radio size="small" />}
          label={t('translation|No StorageClass (static provisioning)')}
        />
        <FormControlLabel
          value="specify"
          control={<Radio size="small" />}
          label={t('translation|Specify StorageClass')}
        />
      </RadioGroup>
      {mode === 'specify' && (
        <FormTextField
          label={t('glossary|Storage Class')}
          value={value ?? ''}
          onChange={e => handleSpecifyChange(e.target.value)}
        />
      )}
    </Box>
  );
}

export default function CreatePVCForm(props: CreatePVCFormProps) {
  const { resource, onChange, onValidChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource = resource ?? {};

  const sections: FormSection[] = [
    {
      title: t('translation|Metadata'),
      fields: [
        {
          key: 'name',
          path: 'metadata.name',
          label: t('translation|Name'),
          required: true,
        },
        {
          key: 'namespace',
          path: 'metadata.namespace',
          label: t('glossary|Namespace'),
          type: 'namespace' as const,
        },
        {
          key: 'labels',
          path: 'metadata.labels',
          label: t('translation|Labels'),
          type: 'labels' as const,
        },
      ],
    },
    {
      title: t('glossary|Storage'),
      fields: [
        {
          key: 'storage',
          path: 'spec.resources.requests.storage',
          label: t('glossary|Storage Size'),
          required: true,
        },
        {
          key: 'accessModes',
          path: 'spec.accessModes',
          label: t('glossary|Access Modes'),
          type: 'select' as const,
          options: [
            { label: 'ReadWriteOnce', value: 'ReadWriteOnce' },
            { label: 'ReadOnlyMany', value: 'ReadOnlyMany' },
            { label: 'ReadWriteMany', value: 'ReadWriteMany' },
            { label: 'ReadWriteOncePod', value: 'ReadWriteOncePod' },
          ],
          required: true,
          multiple: true,
        },
        {
          key: 'storageClassName',
          path: 'spec.storageClassName',
          label: t('glossary|Storage Class'),
          // '' is a deliberate value: it disables default StorageClass
          // selection (static provisioning), distinct from unset.
          allowEmptyString: true,
          render: ({ value, onChange: onFieldChange }) => (
            <StorageClassField value={value} onChange={onFieldChange} />
          ),
        },
        {
          key: 'volumeName',
          path: 'spec.volumeName',
          label: t('glossary|Volume Name'),
        },
      ],
    },
  ];

  return (
    <CreateResourceForm
      sections={sections}
      resource={normalizedResource}
      onChange={onChange}
      onValidChange={onValidChange}
    />
  );
}
