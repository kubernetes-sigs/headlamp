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
import type { KubeJob } from '../../lib/k8s/job';
import CreateResourceForm, {
  FormSection,
  metadataSection,
} from '../common/Resource/CreateResourceForm';

/** Draft Job being edited. */
export type JobDraft = RecursivePartial<KubeJob>;

/** Props for {@link CreateJobForm}. */
export interface CreateJobFormProps {
  resource?: JobDraft;
  onChange: (resource: JobDraft) => void;
  /** Called when required-field validity changes. */
  onValidChange?: (valid: boolean) => void;
}

/** Job create form. Jobs don't take a user-supplied `spec.selector` — the
 *  Job controller auto-generates one — so unlike Deployment/ReplicaSet we
 *  skip the selector field and just edit pod template labels directly. */
export default function CreateJobForm(props: CreateJobFormProps) {
  const { resource, onChange, onValidChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const sections: FormSection[] = [
    metadataSection(t),
    {
      title: t('translation|Spec'),
      fields: [
        {
          key: 'completions',
          path: 'spec.completions',
          label: t('translation|Completions'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t('translation|Number of successfully finished pods required.'),
        },
        {
          key: 'parallelism',
          path: 'spec.parallelism',
          label: t('translation|Parallelism'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t('translation|Maximum number of pods that can run in parallel.'),
        },
        {
          key: 'backoffLimit',
          path: 'spec.backoffLimit',
          label: t('translation|Backoff Limit'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t('translation|Number of retries before marking the Job as failed.'),
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
            'translation|Labels applied to pods created by this Job. Kubernetes also adds its own controller-uid / job-name labels automatically.'
          ),
        },
        {
          key: 'containers',
          path: 'spec.template.spec.containers',
          label: t('translation|Containers'),
          type: 'containers' as const,
          required: true,
          showCommand: true,
        },
        {
          key: 'restartPolicy',
          path: 'spec.template.spec.restartPolicy',
          label: t('translation|Restart Policy'),
          type: 'select' as const,
          required: true,
          options: [
            { value: 'Never', label: 'Never' },
            { value: 'OnFailure', label: 'OnFailure' },
          ],
          helperText: t('translation|Job pods must use Never or OnFailure; Always is not allowed.'),
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
