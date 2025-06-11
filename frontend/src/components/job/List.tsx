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
import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { KubeContainer } from '../../lib/k8s/cluster';
import Job from '../../lib/k8s/job';
import { formatDuration } from '../../lib/util';
import { useNamespaces } from '../../redux/filterSlice';
import { StatusLabel } from '../common/Label';
import { StatusLabelProps } from '../common/Label';
import ResourceListView from '../common/Resource/ResourceListView';
import { SimpleTableProps } from '../common/SimpleTable';
import LightTooltip from '../common/Tooltip/TooltipLight';

export function makeJobStatusLabel(job: Job) {
  if (!job?.status?.conditions) {
    return null;
  }

  const conditionOptions = {
    Failed: {
      status: 'error',
      icon: 'mdi:alert-outline',
    },
    Complete: {
      status: 'success',
      icon: 'mdi:check-bold',
    },
    Suspended: {
      status: '',
      icon: 'mdi:pause',
    },
  };

  const condition = job.status.conditions.find(
    ({ status, type }: { status: string; type: string }) =>
      type in conditionOptions && status === 'True'
  );

  if (!condition) {
    return null;
  }

  const tooltip = '';

  const conditionInfo = conditionOptions[(condition.type as 'Complete' | 'Failed') || 'Suspended'];

  return (
    <LightTooltip title={tooltip} interactive>
      <Box display="inline">
        <StatusLabel status={conditionInfo.status as StatusLabelProps['status']}>
          <Icon aria-label="hidden" icon={conditionInfo.icon} width="1.2rem" height="1.2rem" />
          {condition.type}
        </StatusLabel>
      </Box>
    </LightTooltip>
  );
}

export default function JobsList() {
  const { items: jobs, errors } = Job.useList({ namespace: useNamespaces() });
  return <JobsListRenderer jobs={jobs} errors={errors} reflectTableInURL />;
}

export interface JobsListRendererProps {
  jobs: Job[] | null;
  errors?: ApiError[] | null;
  hideColumns?: 'namespace'[];
  reflectTableInURL?: SimpleTableProps['reflectInURL'];
  noNamespaceFilter?: boolean;
}

export function JobsListRenderer(props: JobsListRendererProps) {
  const { jobs, errors, hideColumns = [], reflectTableInURL = 'jobs', noNamespaceFilter } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  function getCompletions(job: Job) {
    return `${job.spec.completions}/${job.spec.parallelism}`;
  }

  function sortByCompletions(job1: Job, job2: Job) {
    const parallelismSorted = job1.spec.parallelism - job2.spec.parallelism;
    if (parallelismSorted === 0) {
      return job1.spec.completions - job2.spec.completions;
    }
    return parallelismSorted;
  }

  return (
    <ResourceListView
      title={t('Jobs')}
      headerProps={{
        noNamespaceFilter,
      }}
      hideColumns={hideColumns}
      errors={errors}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'completions',
          label: t('Completions'),
          gridTemplate: 'min-content',
          getValue: job => getCompletions(job),
          sort: sortByCompletions,
        },
        {
          id: 'conditions',
          label: t('translation|Conditions'),
          gridTemplate: 'min-content',
          getValue: job =>
            job.status?.conditions?.find(({ status }: { status: string }) => status === 'True') ??
            null,
          render: job => makeJobStatusLabel(job),
        },
        {
          id: 'duration',
          label: t('translation|Duration'),
          gridTemplate: 'min-content',
          getValue: job => {
            const duration = job.getDuration();
            if (duration > 0) {
              return formatDuration(duration, { format: 'mini' });
            }
            return '-';
          },
          sort: (job1, job2) => job1.getDuration() - job2.getDuration(),
        },
        {
          id: 'containers',
          label: t('Containers'),
          getValue: job =>
            job
              .getContainers()
              .map(c => c.name)
              .join(''),
          render: job => {
            const containerNames = job.getContainers().map((c: KubeContainer) => c.name);
            const containerTooltip = containerNames.join('\n');
            const containerText = containerNames.join(', ');
            return (
              <LightTooltip title={containerTooltip} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        {
          id: 'images',
          label: t('Images'),
          gridTemplate: 'auto',
          getValue: job =>
            job
              .getContainers()
              .map(c => c.image)
              .join(''),
          render: job => {
            const containerImages = job.getContainers().map((c: KubeContainer) => c.image);
            const containerTooltip = containerImages.join('\n');
            const containerText = containerImages.join(', ');
            return (
              <LightTooltip title={containerTooltip} interactive>
                {containerText}
              </LightTooltip>
            );
          },
        },
        'age',
      ]}
      data={jobs}
      reflectInURL={reflectTableInURL}
      id="headlamp-jobs"
    />
  );
}
