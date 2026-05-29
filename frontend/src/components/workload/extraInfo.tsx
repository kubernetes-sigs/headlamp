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

import { TFunction } from 'i18next';
import Deployment from '../../lib/k8s/deployment';
import Job from '../../lib/k8s/job';
import StatefulSet from '../../lib/k8s/statefulSet';
import { localeDate } from '../../lib/util';
import Link from '../common/Link';
import { NameValueTableRow } from '../common/NameValueTable';

export function formatDuration(ms: number): string {
  if (ms < 0) return '';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  const days = Math.floor(hours / 24);
  return `${days}d${hours % 24 ? ` ${hours % 24}h` : ''}`;
}

export function deploymentExtraInfo(item: Deployment, t: TFunction): NameValueTableRow[] {
  const spec = item.spec ?? ({} as Deployment['spec']);
  return [
    {
      name: t('glossary|Min Ready Seconds'),
      value: spec.minReadySeconds !== undefined ? `${spec.minReadySeconds}s` : '',
      hide: spec.minReadySeconds === undefined,
    },
    {
      name: t('glossary|Progress Deadline'),
      value: spec.progressDeadlineSeconds !== undefined ? `${spec.progressDeadlineSeconds}s` : '',
      hide: spec.progressDeadlineSeconds === undefined,
    },
    {
      name: t('glossary|Revision History Limit'),
      value: spec.revisionHistoryLimit,
      hide: spec.revisionHistoryLimit === undefined,
    },
  ];
}

export function statefulSetExtraInfo(item: StatefulSet, t: TFunction): NameValueTableRow[] {
  const spec = item.spec ?? ({} as StatefulSet['spec']);
  return [
    {
      name: t('glossary|Service Name'),
      value: spec.serviceName ? (
        <Link
          routeName="service"
          params={{ namespace: item.metadata?.namespace, name: spec.serviceName }}
          activeCluster={item.cluster}
          tooltip
        >
          {spec.serviceName}
        </Link>
      ) : (
        ''
      ),
      hide: !spec.serviceName,
    },
    {
      name: t('glossary|Pod Management Policy'),
      value: spec.podManagementPolicy,
      hide: !spec.podManagementPolicy,
    },
  ];
}

export function jobExtraInfo(item: Job, t: TFunction): NameValueTableRow[] {
  const status = item.status ?? ({} as Job['status']);
  const spec = item.spec ?? ({} as Job['spec']);
  const counts = [
    status.active !== undefined && t('translation|Active: {{ n }}', { n: status.active }),
    status.ready !== undefined && t('translation|Ready: {{ n }}', { n: status.ready }),
    status.succeeded !== undefined && t('translation|Succeeded: {{ n }}', { n: status.succeeded }),
    status.failed !== undefined && t('translation|Failed: {{ n }}', { n: status.failed }),
  ]
    .filter(Boolean)
    .join(', ');
  const duration = formatDuration(item.getDuration());

  return [
    {
      name: t('glossary|Completions'),
      value:
        spec.completions !== undefined
          ? `${status.succeeded ?? 0}/${spec.completions}`
          : status.succeeded !== undefined
          ? `${status.succeeded}`
          : '',
      hide: spec.completions === undefined && status.succeeded === undefined,
    },
    {
      name: t('glossary|Parallelism'),
      value: spec.parallelism,
      hide: spec.parallelism === undefined,
    },
    {
      name: t('glossary|Completion Mode'),
      value: spec.completionMode,
      hide: !spec.completionMode || spec.completionMode === 'NonIndexed',
    },
    {
      name: t('translation|Suspend'),
      value: spec.suspend !== undefined ? String(spec.suspend) : '',
      hide: spec.suspend === undefined,
    },
    {
      name: t('glossary|Backoff Limit'),
      value: spec.backoffLimit,
      hide: spec.backoffLimit === undefined,
    },
    {
      name: t('glossary|Active Deadline'),
      value: spec.activeDeadlineSeconds ? `${spec.activeDeadlineSeconds}s` : '',
      hide: !spec.activeDeadlineSeconds,
    },
    {
      name: t('glossary|TTL After Finished'),
      value: spec.ttlSecondsAfterFinished ? `${spec.ttlSecondsAfterFinished}s` : '',
      hide: spec.ttlSecondsAfterFinished === undefined,
    },
    {
      name: t('glossary|Pods Status'),
      value: counts,
      hide: !counts,
    },
    {
      name: t('glossary|Start Time'),
      value: status.startTime ? localeDate(status.startTime) : '',
      hide: !status.startTime,
    },
    {
      name: t('glossary|Completion Time'),
      value: status.completionTime ? localeDate(status.completionTime) : '',
      hide: !status.completionTime,
    },
    {
      name: t('glossary|Duration'),
      value: duration,
      hide: !duration,
    },
    {
      name: t('glossary|Completed Indexes'),
      value: status.completedIndexes,
      hide: !status.completedIndexes,
    },
  ];
}

export const KIND_EXTRA_INFO: Partial<
  Record<string, (item: any, t: TFunction) => NameValueTableRow[]>
> = {
  Deployment: deploymentExtraInfo,
  StatefulSet: statefulSetExtraInfo,
  Job: jobExtraInfo,
};
