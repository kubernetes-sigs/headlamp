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
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeDaemonSet } from '../../lib/k8s/daemonSet';
import CreateResourceForm, {
  FormSection,
  LabelTextField,
  metadataSection,
  PodLabelsEditor,
  useSelectorPodTemplate,
} from '../common/Resource/CreateResourceForm';

export type DaemonSetDraft = RecursivePartial<KubeDaemonSet>;

export interface CreateDaemonSetFormProps {
  resource?: DaemonSetDraft;
  onChange: (resource: DaemonSetDraft) => void;
  onValidChange?: (valid: boolean) => void;
}

export default function CreateDaemonSetForm(props: CreateDaemonSetFormProps) {
  const { resource, onChange, onValidChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: DaemonSetDraft = React.useMemo(() => resource ?? {}, [resource]);

  const { matchLabels, handleMatchLabelsChange } = useSelectorPodTemplate<DaemonSetDraft>({
    resource: normalizedResource,
    onChange,
    defaultReplicas: null,
  });

  const updateStrategyType = normalizedResource?.spec?.updateStrategy?.type;

  // Clear rollingUpdate config when strategy is switched to OnDelete.
  React.useEffect(() => {
    if (
      updateStrategyType === 'OnDelete' &&
      normalizedResource?.spec?.updateStrategy?.rollingUpdate
    ) {
      const updated = structuredClone(normalizedResource);
      delete updated.spec!.updateStrategy!.rollingUpdate;
      onChange(updated);
    }
  }, [updateStrategyType, normalizedResource, onChange]);

  const sections: FormSection[] = [
    metadataSection(t),
    {
      title: t('translation|Spec'),
      fields: [
        {
          key: 'updateStrategyType',
          path: 'spec.updateStrategy.type',
          label: t('translation|Update Strategy'),
          type: 'select',
          options: [
            { value: 'RollingUpdate', label: 'RollingUpdate' },
            { value: 'OnDelete', label: 'OnDelete' },
          ],
          helperText: t('translation|Strategy used to replace old pods with new ones.'),
        },
        ...(updateStrategyType !== 'OnDelete'
          ? [
              {
                key: 'maxUnavailable',
                path: 'spec.updateStrategy.rollingUpdate.maxUnavailable',
                label: t('translation|Max Unavailable'),
                type: 'number' as const,
                min: 0,
                inline: true,
                helperText: t(
                  'translation|Maximum number of pods that can be unavailable during the update.'
                ),
              },
            ]
          : []),
        {
          key: 'matchLabels',
          path: 'spec.selector.matchLabels',
          label: t('translation|Selector'),
          type: 'labels',
          helperText: t(
            'translation|Selects which pods belong to this DaemonSet. Entries are mirrored read-only into the pod template labels below; extra pod-template-only labels can be added there.'
          ),
          render: ({ value }) => (
            <LabelTextField value={value ?? {}} onChange={handleMatchLabelsChange} />
          ),
        },
      ],
    },
    {
      title: t('translation|Pod Template'),
      fields: [
        {
          key: 'podLabels',
          path: 'spec.template.metadata.labels',
          label: t('translation|Labels'),
          type: 'labels',
          helperText: t(
            'translation|Selector entries appear here read-only. Use New Label to add extra pod-template-only labels.'
          ),
          render: ({ value, onChange: onPodLabelsChange }) => (
            <PodLabelsEditor
              value={value ?? {}}
              lockedLabels={matchLabels}
              onChange={onPodLabelsChange}
            />
          ),
        },
        {
          key: 'containers',
          path: 'spec.template.spec.containers',
          label: t('translation|Containers'),
          type: 'containers',
          required: true,
        },
        {
          key: 'nodeName',
          path: 'spec.template.spec.nodeName',
          label: t('translation|Node Name'),
          helperText: t('translation|Optional: schedule the pod on a specific node.'),
        },
      ],
    },
  ];

  return (
    <CreateResourceForm
      sections={sections}
      resource={resource as Record<string, any>}
      onChange={onChange as (resource: Record<string, any>) => void}
      onValidChange={onValidChange}
    />
  );
}
