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

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import Job from '../../lib/k8s/job';
import { KubeObject } from '../../lib/k8s/KubeObject';
import Pod from '../../lib/k8s/pod';
import { formatDuration } from '../../lib/util';
import {
  ConditionsSection,
  ContainersSection,
  DetailsGrid,
  LogsButton,
  MetadataDictGrid,
  OwnedPodsSection,
} from '../common/Resource';
import { WorkloadDiagnosticsSection } from '../diagnostics/Diagnostics';
import { makeJobStatusLabel } from './List';

export default function JobDetails(props: { name?: string; namespace?: string; cluster?: string }) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const [ownedPods, setOwnedPods] = useState<{
    workloadUid?: string;
    pods: Pod[] | null;
    errors: ApiError[] | null;
  }>({ pods: null, errors: null });
  const handleOwnedPodsUpdate = useCallback(
    (resource: KubeObject, pods: Pod[] | null, errors: ApiError[] | null) => {
      setOwnedPods({ workloadUid: resource.metadata.uid, pods, errors });
    },
    []
  );

  return (
    <DetailsGrid
      resourceType={Job}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      onResourceUpdate={item => {
        setOwnedPods(prev =>
          prev.workloadUid === item?.metadata?.uid
            ? prev
            : { workloadUid: item?.metadata?.uid, pods: null, errors: null }
        );
      }}
      actions={item =>
        item
          ? [
              {
                id: 'logs',
                action: <LogsButton key="logs" item={item} />,
              },
            ]
          : []
      }
      extraInfo={item => {
        if (!item) return [];
        const statusLabel = makeJobStatusLabel(item);
        return [
          {
            name: t('translation|Status'),
            value: statusLabel,
            hide: !statusLabel,
          },
          {
            name: t('glossary|Completions'),
            value: `${item.status?.succeeded ?? 0} / ${item.spec?.completions ?? 1}`,
          },
          {
            name: t('translation|Parallelism'),
            value: item.spec?.parallelism,
          },
          {
            name: t('translation|Backoff Limit'),
            value: item.spec?.backoffLimit,
            hide: item.spec?.backoffLimit === undefined,
          },
          {
            name: t('translation|Completion Mode'),
            value: item.spec?.completionMode ?? 'NonIndexed',
          },
          {
            name: t('translation|Active'),
            value: item.status?.active ?? 0,
          },
          {
            name: t('translation|Succeeded'),
            value: item.status?.succeeded ?? 0,
          },
          {
            name: t('glossary|Failed'),
            value: item.status?.failed ?? 0,
          },
          {
            name: t('translation|Duration'),
            value:
              item.getDuration() > 0 ? formatDuration(item.getDuration(), { format: 'mini' }) : '-',
          },
          {
            name: t('translation|Suspend'),
            value: (item.spec?.suspend ?? false).toString(),
          },
          {
            name: t('glossary|Selector'),
            value: item.spec?.selector?.matchLabels && (
              <MetadataDictGrid
                dict={item.spec.selector.matchLabels as { [key: string]: string }}
              />
            ),
          },
          {
            name: t('translation|Active Deadline'),
            value: `${item.spec.activeDeadlineSeconds}s`,
            hide: !item.spec?.activeDeadlineSeconds,
          },
          {
            name: t('translation|TTL After Finished'),
            value: `${item.spec.ttlSecondsAfterFinished}s`,
            hide: item.spec?.ttlSecondsAfterFinished === undefined,
          },
        ];
      }}
      extraSections={item =>
        item
          ? [
              {
                id: 'headlamp.job-diagnostics',
                section: (
                  <WorkloadDiagnosticsSection
                    workload={item}
                    pods={ownedPods.workloadUid === item.metadata.uid ? ownedPods.pods : null}
                    errors={ownedPods.workloadUid === item.metadata.uid ? ownedPods.errors : null}
                  />
                ),
              },
              {
                id: 'headlamp.job-conditions',
                section: <ConditionsSection resource={item?.jsonData} />,
              },
              {
                id: 'headlamp.job-owned-pods',
                section: <OwnedPodsSection resource={item} onPodsUpdate={handleOwnedPodsUpdate} />,
              },
              {
                id: 'headlamp.job-containers',
                section: <ContainersSection resource={item} />,
              },
            ]
          : []
      }
    />
  );
}
