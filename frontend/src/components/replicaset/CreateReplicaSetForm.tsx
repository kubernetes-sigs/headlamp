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
import type { RecursivePartial } from '../../lib/k8s/api/v1/factories';
import type { KubeReplicaSet } from '../../lib/k8s/replicaSet';
import CreateResourceForm, {
  FormSection,
  LabelTextField,
  PodLabelsEditor,
  useSelectorPodTemplate,
} from '../common/Resource/CreateResourceForm';

/** Draft ReplicaSet being edited. All fields optional but typed against
 *  {@link KubeReplicaSet} to catch typos.
 *
 *  Convention: `export type XxxDraft = RecursivePartial<KubeXxx>;` */
export type ReplicaSetDraft = RecursivePartial<KubeReplicaSet>;

/** Props for {@link CreateReplicaSetForm}. Standard `{ resource, onChange }`
 *  used by all create-resource forms. */
export interface CreateReplicaSetFormProps {
  resource?: ReplicaSetDraft;
  onChange: (resource: ReplicaSetDraft) => void;
}

/** ReplicaSet create form built on {@link CreateResourceForm}. Sections:
 *  metadata, spec (replicas + minReadySeconds + selector), pod template.
 *  Selector entries show up read-only in the pod template labels; users
 *  can add extra editable labels next to them. */
export default function CreateReplicaSetForm(props: CreateReplicaSetFormProps) {
  const { resource, onChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: ReplicaSetDraft = resource ?? {};

  const { matchLabels, handleMatchLabelsChange } = useSelectorPodTemplate<ReplicaSetDraft>({
    resource: normalizedResource,
    onChange,
  });

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
          key: 'replicas',
          path: 'spec.replicas',
          label: t('translation|Replicas'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t('translation|Desired number of pod replicas'),
        },
        {
          key: 'minReadySeconds',
          path: 'spec.minReadySeconds',
          label: t('translation|Min Ready Seconds'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t(
            'translation|Minimum seconds a new pod must run without crashing before being considered available.'
          ),
        },
        {
          key: 'matchLabels',
          path: 'spec.selector.matchLabels',
          label: t('translation|Selector'),
          type: 'labels' as const,
          helperText: t(
            'translation|Selects which pods belong to this ReplicaSet. Entries are mirrored read-only into the pod template labels below; extra pod-template-only labels can be added there.'
          ),
          render: ({ value }) => (
            <LabelTextField
              value={(value as Record<string, string>) ?? {}}
              onChange={handleMatchLabelsChange}
            />
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
          type: 'labels' as const,
          helperText: t(
            'translation|Selector entries appear here read-only. Use New Label to add extra pod-template-only labels.'
          ),
          render: ({ value, onChange: onPodLabelsChange }) => (
            <PodLabelsEditor
              value={(value as Record<string, string>) ?? {}}
              lockedLabels={matchLabels}
              onChange={onPodLabelsChange}
            />
          ),
        },
        {
          key: 'containers',
          path: 'spec.template.spec.containers',
          label: t('translation|Containers'),
          type: 'containers' as const,
        },
      ],
    },
  ];

  return (
    <CreateResourceForm
      sections={sections}
      resource={normalizedResource as Record<string, any>}
      onChange={onChange as (resource: Record<string, any>) => void}
    />
  );
}
