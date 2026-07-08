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
import type { KubeDeployment } from '../../lib/k8s/deployment';
import CreateResourceForm, {
  FormSection,
  LabelTextField,
  metadataSection,
  PodLabelsEditor,
  useSelectorPodTemplate,
} from '../common/Resource/CreateResourceForm';

/** Draft Deployment being edited. All fields optional but typed against
 *  {@link KubeDeployment} to catch typos.
 *
 *  Convention: `export type XxxDraft = RecursivePartial<KubeXxx>;` */
export type DeploymentDraft = RecursivePartial<KubeDeployment>;

/** Props for {@link CreateDeploymentForm}. Standard `{ resource, onChange }`
 *  used by all create-resource forms. */
export interface CreateDeploymentFormProps {
  resource?: DeploymentDraft;
  onChange: (resource: DeploymentDraft) => void;
  /** Called when required-field validity changes. */
  onValidChange?: (valid: boolean) => void;
}

/** Deployment create form built on {@link CreateResourceForm}. Sections:
 *  metadata, spec (selector + replicas), pod template. Selector entries
 *  show up read-only in the pod template labels; users can add extra
 *  editable labels next to them. */
export default function CreateDeploymentForm(props: CreateDeploymentFormProps) {
  const { resource, onChange, onValidChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: DeploymentDraft = resource ?? {};

  const { matchLabels, handleMatchLabelsChange } = useSelectorPodTemplate<DeploymentDraft>({
    resource: normalizedResource,
    onChange,
  });

  const sections: FormSection[] = [
    metadataSection(t),
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
          key: 'matchLabels',
          path: 'spec.selector.matchLabels',
          label: t('translation|Selector'),
          type: 'labels' as const,
          helperText: t(
            'translation|Selects which pods belong to this Deployment. Entries are mirrored read-only into the pod template labels below; extra pod-template-only labels can be added there.'
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
          required: true,
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
