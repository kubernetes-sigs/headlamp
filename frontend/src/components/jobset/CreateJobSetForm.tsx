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
import type { KubeJobSet } from '../../lib/k8s/jobSet';
import CreateResourceForm, { FormSection } from '../common/Resource/CreateResourceForm';

/** Draft JobSet being edited. */
export type JobSetDraft = RecursivePartial<KubeJobSet>;

/** Props for {@link CreateJobSetForm}. */
export interface CreateJobSetFormProps {
  resource?: JobSetDraft;
  onChange: (resource: JobSetDraft) => void;
}

/** JobSet create form. Edits the first entry in `spec.replicatedJobs`
 *  (matching `JobSet.getBaseObject()`); multiple replicated jobs must be
 *  managed via the YAML editor for now. */
export default function CreateJobSetForm(props: CreateJobSetFormProps) {
  const { resource, onChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: JobSetDraft = resource ?? {};

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
      title: t('translation|Replicated Job'),
      fields: [
        {
          key: 'rjName',
          path: 'spec.replicatedJobs[0].name',
          label: t('translation|Name'),
          required: true,
          helperText: t('translation|Name of this replicated job group.'),
        },
        {
          key: 'rjReplicas',
          path: 'spec.replicatedJobs[0].replicas',
          label: t('translation|Replicas'),
          type: 'number' as const,
          min: 1,
          inline: true,
          helperText: t('translation|Number of Job instances created from this template.'),
        },
        {
          key: 'rjCompletions',
          path: 'spec.replicatedJobs[0].template.spec.completions',
          label: t('translation|Completions'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t('translation|Successful pod completions required per Job.'),
        },
        {
          key: 'rjParallelism',
          path: 'spec.replicatedJobs[0].template.spec.parallelism',
          label: t('translation|Parallelism'),
          type: 'number' as const,
          min: 0,
          inline: true,
          helperText: t('translation|Maximum pods running in parallel per Job.'),
        },
      ],
    },
    {
      title: t('translation|Pod Template'),
      fields: [
        {
          key: 'podLabels',
          path: 'spec.replicatedJobs[0].template.spec.template.metadata.labels',
          label: t('translation|Labels'),
          type: 'labels' as const,
        },
        {
          key: 'containers',
          path: 'spec.replicatedJobs[0].template.spec.template.spec.containers',
          label: t('translation|Containers'),
          type: 'containers' as const,
          showCommand: true,
        },
        {
          key: 'restartPolicy',
          path: 'spec.replicatedJobs[0].template.spec.template.spec.restartPolicy',
          label: t('translation|Restart Policy'),
          type: 'select' as const,
          options: [
            { value: 'Never', label: 'Never' },
            { value: 'OnFailure', label: 'OnFailure' },
          ],
          helperText: t('translation|Job pods must use Never or OnFailure; Always is not allowed.'),
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
