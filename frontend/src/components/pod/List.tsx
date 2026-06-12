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

import Box from '@mui/material/Box';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import Pod from '../../lib/k8s/pod';
import { METRIC_REFETCH_INTERVAL_MS, PodMetrics } from '../../lib/k8s/PodMetrics';
import { parseCpu, parseRam, unparseCpu, unparseRam } from '../../lib/units';
import { timeAgo } from '../../lib/util';
import { useNamespaces } from '../../redux/filterSlice';
import { HeadlampEventType, useEventCallback } from '../../redux/headlampEventSlice';
import { CreateResourceButton } from '../common';
import Link from '../common/Link';
import ResourceListView from '../common/Resource/ResourceListView';
import { SimpleTableProps } from '../common/SimpleTable';
import { TooltipIcon } from '../common/Tooltip';
import LightTooltip from '../common/Tooltip/TooltipLight';
import { makePodStatusLabel } from './podStatus';

function getReadinessGatesStatus(pods: Pod) {
  const readinessGates = pods?.spec?.readinessGates?.map(gate => gate.conditionType) || [];
  const readinessGatesMap: { [key: string]: string } = {};
  if (readinessGates.length === 0) {
    return readinessGatesMap;
  }

  pods?.status?.conditions?.forEach(condition => {
    if (readinessGates.includes(condition.type)) {
      readinessGatesMap[condition.type] = condition.status;
    }
  });

  return readinessGatesMap;
}

export interface PodListProps {
  pods: Pod[] | null;
  metrics: PodMetrics[] | null;
  hideColumns?: ('namespace' | 'restarts')[];
  reflectTableInURL?: SimpleTableProps['reflectInURL'];
  noNamespaceFilter?: boolean;
  errors?: ApiError[] | null;
  hideCreateButton?: boolean;
  enableRowActions?: boolean;
  enableRowSelection?: boolean;
}

export function PodListRenderer(props: PodListProps) {
  const {
    pods,
    metrics,
    hideColumns = [],
    reflectTableInURL = 'pods',
    noNamespaceFilter,
    errors,
    hideCreateButton,
    enableRowActions,
    enableRowSelection,
  } = props;
  const { t } = useTranslation(['glossary', 'translation']);

  const getCpuUsage = (pod: Pod) => {
    const metric = metrics?.find(
      it => it.getName() === pod.getName() && it.getNamespace() === pod.getNamespace()
    );
    if (!metric) return;

    return (
      metric?.jsonData.containers.map(it => parseCpu(it.usage.cpu)).reduce((a, b) => a + b, 0) ?? 0
    );
  };

  const getMemoryUsage = (pod: Pod) => {
    const metric = metrics?.find(
      it => it.getName() === pod.getName() && it.getNamespace() === pod.getNamespace()
    );
    if (!metric) return;

    return (
      metric?.jsonData.containers.map(it => parseRam(it.usage.memory)).reduce((a, b) => a + b, 0) ??
      0
    );
  };

  return (
    <ResourceListView
      title={t('Pods')}
      headerProps={{
        noNamespaceFilter,
        titleSideActions: hideCreateButton
          ? []
          : [<CreateResourceButton resourceClass={Pod} key="create-pod-button" />],
      }}
      hideColumns={hideColumns}
      errors={errors}
      columns={[
        'name',
        'namespace',
        'cluster',
        {
          label: t('Restarts'),
          gridTemplate: 'min-content',
          disableFiltering: true,
          getValue: pod => {
            const { restarts, lastRestartDate } = pod.getDetailedStatus();
            return lastRestartDate.getTime() !== 0
              ? t('{{ restarts }} ({{ abbrevTime }} ago)', {
                  restarts: restarts,
                  abbrevTime: timeAgo(lastRestartDate, { format: 'mini' }),
                })
              : restarts;
          },
        },
        {
          id: 'ready',
          gridTemplate: 'min-content',
          label: t('translation|Ready'),
          disableFiltering: true,
          getValue: pod => {
            const podRow = pod.getDetailedStatus();
            return `${podRow.readyContainers}/${podRow.totalContainers}`;
          },
        },
        {
          id: 'status',
          gridTemplate: 'min-content',
          filterVariant: 'multi-select',
          label: t('translation|Status'),
          // include ready condition status so the cell re-renders when icon state changes
          getValue: pod => {
            const status = pod.getDetailedStatus();
            const readyCondition = (pod.status?.conditions || []).find(c => c.type === 'Ready');
            const phase = pod.status?.phase || '';
            return `${phase}:${status.reason}:${readyCondition?.status ?? ''}`;
          },
          render: makePodStatusLabel,
        },
        ...(metrics?.length
          ? [
              {
                id: 'cpu',
                label: t('CPU'),
                gridTemplate: 'min-content',
                disableFiltering: true,
                render: (pod: Pod) => {
                  const cpu = getCpuUsage(pod);
                  if (cpu === undefined) return;

                  const { value: aValue, unit: aUnit } = unparseCpu(String(cpu));

                  const request = pod.spec.containers
                    .map(c => parseCpu(c.resources?.requests?.cpu || '0'))
                    .reduce((a, b) => a + b, 0);

                  const limit = pod.spec.containers
                    .map(c => parseCpu(c.resources?.limits?.cpu || '0'))
                    .reduce((a, b) => a + b, 0);

                  const tooltipLines = [];
                  if (request > 0) {
                    const { value: rValue, unit: rUnit } = unparseCpu(String(request));
                    const percentOfRequest = ((cpu / request) * 100).toFixed(1);
                    tooltipLines.push(
                      t('Request') +
                        `: ${percentOfRequest}% (${aValue} ${aUnit}/${rValue} ${rUnit})`
                    );
                  }
                  if (limit > 0) {
                    const { value: lValue, unit: lUnit } = unparseCpu(String(limit));
                    const percentOfLimit = ((cpu / limit) * 100).toFixed(1);
                    tooltipLines.push(
                      t('Limit') + `: ${percentOfLimit}% (${aValue} ${aUnit}/${lValue} ${lUnit})`
                    );
                  }

                  return (
                    <Box display="flex" alignItems="center" width="100%">
                      <span style={{ whiteSpace: 'nowrap' }}>{`${aValue} ${aUnit}`}</span>
                      {tooltipLines.length > 0 && (
                        <Box component="span" sx={{ display: 'inline-flex', ml: 'auto' }}>
                          <TooltipIcon>
                            <span style={{ whiteSpace: 'pre-line' }}>
                              {tooltipLines.join('\n')}
                            </span>
                          </TooltipIcon>
                        </Box>
                      )}
                    </Box>
                  );
                },
                getValue: (pod: Pod) => getCpuUsage(pod) ?? 0,
              },
              {
                id: 'memory',
                label: t('Memory'),
                gridTemplate: 'min-content',
                disableFiltering: true,
                render: (pod: Pod) => {
                  const memory = getMemoryUsage(pod);
                  if (memory === undefined) return;
                  const { value: aValue, unit: aUnit } = unparseRam(memory);

                  const request = pod.spec.containers
                    .map(c => parseRam(c.resources?.requests?.memory || '0'))
                    .reduce((a, b) => a + b, 0);

                  const limit = pod.spec.containers
                    .map(c => parseRam(c.resources?.limits?.memory || '0'))
                    .reduce((a, b) => a + b, 0);

                  const tooltipLines = [];
                  if (request > 0) {
                    const { value: rValue, unit: rUnit } = unparseRam(request);
                    const percentOfRequest = ((memory / request) * 100).toFixed(1);
                    tooltipLines.push(
                      t('Request') +
                        `: ${percentOfRequest}% (${aValue} ${aUnit}/${rValue} ${rUnit})`
                    );
                  }
                  if (limit > 0) {
                    const { value: lValue, unit: lUnit } = unparseRam(limit);
                    const percentOfLimit = ((memory / limit) * 100).toFixed(1);
                    tooltipLines.push(
                      t('Limit') + `: ${percentOfLimit}% (${aValue} ${aUnit}/${lValue} ${lUnit})`
                    );
                  }

                  return (
                    <Box display="flex" alignItems="center" width="100%">
                      <span style={{ whiteSpace: 'nowrap' }}>{`${aValue} ${aUnit}`}</span>
                      {tooltipLines.length > 0 && (
                        <Box component="span" sx={{ display: 'inline-flex', ml: 'auto' }}>
                          <TooltipIcon>
                            <span style={{ whiteSpace: 'pre-line' }}>
                              {tooltipLines.join('\n')}
                            </span>
                          </TooltipIcon>
                        </Box>
                      )}
                    </Box>
                  );
                },
                getValue: (pod: Pod) => getMemoryUsage(pod) ?? 0,
              },
            ]
          : []),
        {
          id: 'ip',
          gridTemplate: 'min-content',
          label: t('glossary|IP'),
          getValue: pod => pod.status?.podIP ?? '',
        },
        {
          id: 'node',
          label: t('glossary|Node'),
          gridTemplate: 'auto',
          filterVariant: 'multi-select',
          getValue: pod => pod?.spec?.nodeName,
          render: pod =>
            pod?.spec?.nodeName && (
              <Link
                routeName="node"
                params={{ name: pod.spec.nodeName }}
                activeCluster={pod.cluster}
                tooltip
              >
                {pod.spec.nodeName}
              </Link>
            ),
        },
        {
          id: 'nominatedNode',
          label: t('glossary|Nominated Node'),
          getValue: pod => pod?.status?.nominatedNodeName,
          render: pod =>
            !!pod?.status?.nominatedNodeName && (
              <Link
                routeName="node"
                params={{ name: pod?.status?.nominatedNodeName }}
                activeCluster={pod.cluster}
                tooltip
              >
                {pod?.status?.nominatedNodeName}
              </Link>
            ),
          show: false,
        },
        {
          id: 'readinessGates',
          label: t('glossary|Readiness Gates'),
          getValue: pod => {
            const readinessGatesStatus = getReadinessGatesStatus(pod);
            const total = Object.keys(readinessGatesStatus).length;

            if (total === 0) {
              return '';
            }

            const statusTrueCount = Object.values(readinessGatesStatus).filter(
              status => status === 'True'
            ).length;

            return statusTrueCount;
          },
          render: pod => {
            const readinessGatesStatus = getReadinessGatesStatus(pod);
            const total = Object.keys(readinessGatesStatus).length;

            if (total === 0) {
              return null;
            }

            const statusTrueCount = Object.values(readinessGatesStatus).filter(
              status => status === 'True'
            ).length;

            return (
              <LightTooltip
                title={Object.keys(readinessGatesStatus)
                  .map(conditionType => `${conditionType}: ${readinessGatesStatus[conditionType]}`)
                  .join('\n')}
                interactive
              >
                <span>{`${statusTrueCount}/${total}`}</span>
              </LightTooltip>
            );
          },
          sort: (p1: Pod, p2: Pod) => {
            const readinessGatesStatus1 = getReadinessGatesStatus(p1);
            const readinessGatesStatus2 = getReadinessGatesStatus(p2);
            const total1 = Object.keys(readinessGatesStatus1).length;
            const total2 = Object.keys(readinessGatesStatus2).length;

            if (total1 !== total2) {
              return total1 - total2;
            }

            const statusTrueCount1 = Object.values(readinessGatesStatus1).filter(
              status => status === 'True'
            ).length;
            const statusTrueCount2 = Object.values(readinessGatesStatus2).filter(
              status => status === 'True'
            ).length;

            return statusTrueCount1 - statusTrueCount2;
          },
          show: false,
        },
        'labels',
        'age',
      ]}
      data={pods}
      reflectInURL={reflectTableInURL}
      id="headlamp-pods"
      enableRowActions={enableRowActions}
      enableRowSelection={enableRowSelection}
    />
  );
}

export default function PodList() {
  const { items, errors } = Pod.useList({ namespace: useNamespaces() });
  const { items: podMetrics } = PodMetrics.useList({
    namespace: useNamespaces(),
    refetchInterval: METRIC_REFETCH_INTERVAL_MS,
  });

  const dispatchHeadlampEvent = useEventCallback(HeadlampEventType.LIST_VIEW);

  React.useEffect(() => {
    dispatchHeadlampEvent({
      resources: items ?? [],
      resourceKind: 'Pod',
      error: errors?.[0] || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, errors]);

  return <PodListRenderer pods={items} errors={errors} metrics={podMetrics} reflectTableInURL />;
}
