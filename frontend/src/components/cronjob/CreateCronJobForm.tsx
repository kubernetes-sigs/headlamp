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
import type { KubeCronJob } from '../../lib/k8s/cronJob';
import CreateResourceForm, { FormSection } from '../common/Resource/CreateResourceForm';

/** Draft CronJob being edited. */
export type CronJobDraft = RecursivePartial<KubeCronJob>;

/** Props for {@link CreateCronJobForm}. */
export interface CreateCronJobFormProps {
  resource?: CronJobDraft;
  onChange: (resource: CronJobDraft) => void;
}

/** CronJob create form. A CronJob has no top-level selector — the embedded
 *  Job template owns the pod spec, so this form skips the selector +
 *  pod-template mirroring used by Deployment/Job. */
export default function CreateCronJobForm(props: CreateCronJobFormProps) {
  const { resource, onChange } = props;

  const { t } = useTranslation(['translation', 'glossary']);

  const normalizedResource: CronJobDraft = resource ?? {};

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
          key: 'schedule',
          path: 'spec.schedule',
          label: t('translation|Schedule'),
          required: true,
          helperText: t('translation|Cron expression, e.g. "*/5 * * * *".'),
        },
        {
          key: 'timeZone',
          path: 'spec.timeZone',
          label: t('translation|Time Zone'),
          helperText: t('translation|IANA time zone name, e.g. "Etc/UTC".'),
        },
        {
          key: 'concurrencyPolicy',
          path: 'spec.concurrencyPolicy',
          label: t('translation|Concurrency Policy'),
          type: 'select' as const,
          options: [
            { value: 'Allow', label: 'Allow' },
            { value: 'Forbid', label: 'Forbid' },
            { value: 'Replace', label: 'Replace' },
          ],
        },
        {
          key: 'suspend',
          path: 'spec.suspend',
          label: t('translation|Suspend'),
          type: 'boolean' as const,
          helperText: t('translation|If set, no new Jobs will be scheduled.'),
        },
        {
          key: 'startingDeadlineSeconds',
          path: 'spec.startingDeadlineSeconds',
          label: t('translation|Starting Deadline (s)'),
          type: 'number' as const,
          min: 0,
          inline: true,
        },
        {
          key: 'successfulJobsHistoryLimit',
          path: 'spec.successfulJobsHistoryLimit',
          label: t('translation|Successful Jobs History Limit'),
          type: 'number' as const,
          min: 0,
          inline: true,
        },
        {
          key: 'failedJobsHistoryLimit',
          path: 'spec.failedJobsHistoryLimit',
          label: t('translation|Failed Jobs History Limit'),
          type: 'number' as const,
          min: 0,
          inline: true,
        },
      ],
    },
    {
      title: t('translation|Job Template'),
      fields: [
        {
          key: 'podLabels',
          path: 'spec.jobTemplate.spec.template.metadata.labels',
          label: t('translation|Pod Labels'),
          type: 'labels' as const,
        },
        {
          key: 'containers',
          path: 'spec.jobTemplate.spec.template.spec.containers',
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
