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

import React from 'react';
import { useTranslation } from 'react-i18next';
import CreateResourceForm, { FormSection } from '../common/Resource/CreateResourceForm';

/** Props for {@link CreatePodForm}. */
export interface CreatePodFormProps {
  /** Current resource object from the editor/form state. */
  resource?: Record<string, any>;
  /** Called when form fields update the resource object. */
  onChange: (resource: Record<string, any>) => void;
}

/** Pod-specific creation form built on {@link CreateResourceForm}. Defines
 *  sections for metadata (name, namespace, labels), containers, and node
 *  scheduling. */
export default function CreatePodForm(props: CreatePodFormProps) {
  const { resource, onChange } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource = resource ?? {};

  const sections: FormSection[] = [
    {
      title: t('translation|Metadata'),
      fields: [
        { key: 'name', path: 'metadata.name', label: t('translation|Name'), required: true },
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
      title: t('translation|Spec'),
      fields: [
        {
          key: 'containers',
          path: 'spec.containers',
          label: t('translation|Containers'),
          type: 'containers' as const,
        },
      ],
    },
    {
      title: t('translation|Node'),
      fields: [
        {
          key: 'nodeName',
          path: 'spec.nodeName',
          label: t('translation|Node Name'),
          helperText: t('translation|Optional: schedule the pod on a specific node'),
        },
      ],
    },
  ];

  return (
    <CreateResourceForm sections={sections} resource={normalizedResource} onChange={onChange} />
  );
}
