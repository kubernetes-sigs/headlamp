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

import cronstrue from 'cronstrue/i18n';
import { useTranslation } from 'react-i18next';
import CronJob from '../../lib/k8s/cronJob';
import { DateLabel } from '../common/Label';
import { HoverInfoLabel } from '../common/Label';
import ResourceListView from '../common/Resource/ResourceListView';
import LightTooltip from '../common/Tooltip/TooltipLight';

export function getSchedule(cronJob: CronJob, locale: string) {
  const { schedule } = cronJob.spec;
  let described = '';
  if (!schedule.startsWith('@')) {
    try {
      described = cronstrue.toString(schedule, { locale });
    } catch (e) {
      console.debug(
        `Could not describe cron "${schedule}" for cronJob ${cronJob.metadata.namespace}/${cronJob.metadata.name}:`,
        e
      );
    }
  }
  return <HoverInfoLabel label={schedule} hoverInfo={described} />;
}

export function getLastScheduleTime(cronJob: CronJob) {
  const { lastScheduleTime } = cronJob.status;
  if (!lastScheduleTime) {
    return '';
  }
  return <DateLabel date={lastScheduleTime} format="mini" />;
}

export default function CronJobList() {
  const { t, i18n } = useTranslation(['glossary', 'translation']);

  return (
    <ResourceListView
      title={t('Cron Jobs')}
      resourceClass={CronJob}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          id: 'schedule',
          label: t('Schedule'),
          getValue: cronJob => cronJob.spec.schedule,
          render: cronJob => getSchedule(cronJob, i18n.language),
        },
        {
          id: 'suspend',
          label: t('translation|Suspend'),
          getValue: cronJob => cronJob.spec.suspend.toString(),
          gridTemplate: 0.6,
        },
        {
          id: 'active',
          label: t('translation|Active'),
          getValue: cronJob => cronJob.status?.active?.length || 0,
          gridTemplate: 0.6,
        },
        {
          id: 'lastScheduleTime',
          label: t('Last Schedule'),
          getValue: cronJob => cronJob.status.lastScheduletime ?? '',
          render: cronJob => getLastScheduleTime(cronJob),
        },
        {
          id: 'containers',
          label: t('Containers'),
          getValue: deployment =>
            deployment
              .getContainers()
              .map(c => c.name)
              .join(', '),
          render: deployment => {
            const containers = deployment.getContainers().map(c => c.name);
            const containerText = containers.join(', ');
            const containerTooltip = containers.join('\n');
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
          getValue: deployment =>
            deployment
              .getContainers()
              .map(c => c.image)
              .join(', '),
          render: deployment => {
            const images = deployment.getContainers().map(c => c.image);
            const imageText = images.join(', ');
            const imageTooltip = images.join('\n');
            return (
              <LightTooltip title={imageTooltip} interactive>
                {imageText}
              </LightTooltip>
            );
          },
        },
        'age',
      ]}
    />
  );
}
