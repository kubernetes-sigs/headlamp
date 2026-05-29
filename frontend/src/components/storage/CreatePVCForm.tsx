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

import { useTranslation } from 'react-i18next';
import CreateResourceForm, { FormSection } from '../common/Resource/CreateResourceForm';

/** Props for CreatePVCForm */
export interface CreatePVCFormProps {
  resource?: Record<string, any>;
  onChange: (resource: Record<string, any>) => void;
}

export default function CreatePVCForm(props: CreatePVCFormProps) {
  const { resource, onChange } = props;
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
          type: 'single-field' as const,
        },
        {
          key: 'volumeName',
          path: 'spec.volumeName',
          label: t('glossary|Volume Name'),
          helperText: t('translation|Optional: bind to an existing PersistentVolume', {
            defaultValue: 'Optional: bind to an existing PersistentVolume',
          }),
          type: 'single-field' as const,
        },
      ],
    },
  ];

  return (
    <CreateResourceForm sections={sections} resource={normalizedResource} onChange={onChange} />
  );
}
