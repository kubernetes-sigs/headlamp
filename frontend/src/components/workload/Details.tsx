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
import { useParams } from 'react-router-dom';
import { WorkloadClass } from '../../lib/k8s/Workload';
import { Workload } from '../../lib/k8s/Workload';
import {
  ConditionsSection,
  ContainersSection,
  DetailsGrid,
  LogsButton,
  MetadataDictGrid,
  OwnedPodsSection,
  RevisionHistorySection,
  RollbackButton,
} from '../common/Resource';

interface WorkloadDetailsProps<T extends WorkloadClass> {
  workloadKind: T;
  name?: string;
  namespace?: string;
  cluster?: string;
}

export default function WorkloadDetails<T extends WorkloadClass>(props: WorkloadDetailsProps<T>) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { workloadKind } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  function renderUpdateStrategy(item: Workload) {
    if (!item?.spec?.strategy) {
      return null;
    }

    if (item.spec.strategy.type === 'RollingUpdate') {
      const rollingUpdate = item.spec.strategy.rollingUpdate;
      return t('RollingUpdate. Max unavailable: {{ maxUnavailable }}, max surge: {{ maxSurge }}', {
        maxUnavailable: rollingUpdate.maxUnavailable,
        maxSurge: rollingUpdate.maxSurge,
      });
    }

    return item.spec.strategy.type;
  }

  function showReplicas(item: Workload) {
    return (
      item.kind === 'Deployment' &&
      (item.spec?.status?.replicas !== undefined || item.spec?.replicas !== undefined)
    );
  }

  function renderReplicas(item: Workload) {
    if (!showReplicas(item)) {
      return null;
    }

    let values: { [key: string]: string } = {
      [t('translation|Desired', { context: 'replicas' })]: item.spec.replicas,
      [t('translation|Ready', { context: 'replicas' })]: item.status.readyReplicas,
      [t('translation|Up to date', { context: 'replicas' })]: item.status.updatedReplicas,
      [t('translation|Available', { context: 'replicas' })]: item.status.availableReplicas,
      [t('translation|Total')]: item.status.replicas,
    };

    const validEntries = Object.entries(values).filter(
      ([key]: string[]) => values[key] !== undefined
    );
    values = Object.fromEntries(validEntries);

    if (Object.values(values).length === 0) {
      return null;
    }

    return (
      <MetadataDictGrid
        dict={values}
        gridProps={{
          direction: 'column',
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
        }}
      />
    );
  }

  return (
    <DetailsGrid
      resourceType={workloadKind}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      actions={item => {
        if (!item) return [];
        const actions = [];

        const isLoggable = ['Deployment', 'ReplicaSet', 'DaemonSet'].includes(workloadKind.kind);
        if (isLoggable) {
          actions.push({
            id: 'logs',
            action: <LogsButton key="logs" item={item} />,
          });
        }

        const isRollbackable = ['Deployment', 'DaemonSet', 'StatefulSet'].includes(
          workloadKind.kind
        );
        if (isRollbackable) {
          actions.push({
            id: 'rollback',
            action: <RollbackButton key="rollback" item={item} />,
          });
        }

        return actions;
      }}
      extraInfo={item =>
        item && [
          {
            name: t('Strategy Type'),
            value: renderUpdateStrategy(item),
            hide: !item.spec.strategy,
          },
          {
            name: t('Selector'),
            value: item.spec.selector && (
              <MetadataDictGrid
                dict={item.spec.selector.matchLabels as { [key: string]: string }}
              />
            ),
          },
          {
            name: t('Node Selector'),
            value: item.spec?.template?.spec?.nodeSelector && (
              <MetadataDictGrid
                dict={item.spec.template.spec.nodeSelector as { [key: string]: string }}
              />
            ),
          },
          {
            name: t('Replicas'),
            value: renderReplicas(item),
            hide: !showReplicas(item),
          },
        ]
      }
      extraSections={item => {
        if (!item) return [];
        const sections = [
          {
            id: 'headlamp.workload-conditions',
            section: <ConditionsSection resource={item?.jsonData} />,
          },
          {
            id: 'headlamp.workload-owned-pods',
            section: <OwnedPodsSection resource={item} />,
          },
          {
            id: 'headlamp.workload-containers',
            section: <ContainersSection resource={item} />,
          },
        ];

        // Add revision history for rollbackable workloads
        const isRollbackable = ['Deployment', 'DaemonSet', 'StatefulSet'].includes(
          workloadKind.kind
        );
        if (isRollbackable) {
          sections.push({
            id: 'headlamp.workload-revision-history',
            section: <RevisionHistorySection resource={item} />,
          });
        }

        return sections;
      }}
    />
  );
}
