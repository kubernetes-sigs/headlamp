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

import '../../../i18n/config';
import { useTheme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { KubeMetrics } from '../../../lib/k8s/cluster';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { formatMetricValueUnit, parseCpu, parseRam } from '../../../lib/units';
import ResourceCircularChart, {
  CircularChartProps as ResourceCircularChartProps,
} from '../../common/Resource/CircularChart';
import TileChart from '../../common/TileChart';

export function MemoryCircularChart(props: ResourceCircularChartProps) {
  const { noMetrics } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  function memoryUsedGetter(item: KubeMetrics) {
    return parseRam(item.usage.memory);
  }

  function memoryAvailableGetter(item: Node | Pod) {
    return parseRam(item.status?.capacity?.memory);
  }

  function getLegend(used: number, available: number) {
    if (available === 0 || available === -1) {
      return '';
    }

    const availableLabel = formatMetricValueUnit(available, '', 'binary');
    if (noMetrics) {
      return availableLabel;
    }
    const usedLabel = formatMetricValueUnit(used, '', 'binary');

    return `${usedLabel} / ${availableLabel}`;
  }

  return (
    <ResourceCircularChart
      getLegend={getLegend}
      resourceUsedGetter={memoryUsedGetter}
      resourceAvailableGetter={memoryAvailableGetter}
      title={noMetrics ? t('glossary|Memory') : t('translation|Memory Usage')}
      {...props}
    />
  );
}

export function CpuCircularChart(props: ResourceCircularChartProps) {
  const { noMetrics } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  function cpuUsedGetter(item: KubeMetrics) {
    return parseCpu(item.usage.cpu);
  }

  function cpuAvailableGetter(item: Node | Pod) {
    return parseCpu(item.status?.capacity?.cpu);
  }

  function getLegend(used: number, available: number) {
    if (available === 0 || available === -1) {
      return '';
    }

    const availableLabel = `${formatMetricValueUnit(available, '', '')} ${t('cores')}`;
    if (noMetrics) {
      return availableLabel;
    }
    const usedLabel = formatMetricValueUnit(used, '', 'cpu');

    return `${usedLabel} / ${availableLabel}`;
  }

  return (
    <ResourceCircularChart
      getLegend={getLegend}
      resourceUsedGetter={cpuUsedGetter}
      resourceAvailableGetter={cpuAvailableGetter}
      title={noMetrics ? t('glossary|CPU') : t('translation|CPU Usage')}
      {...props}
    />
  );
}

export function PodsStatusCircleChart(props: { items: Pod[] | null }) {
  const theme = useTheme();
  const { items } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const podsReady = (items || []).filter((pod: Pod) => {
    if (pod.status!.phase === 'Succeeded') {
      return true;
    }

    const readyCondition = pod.status?.conditions?.find(condition => condition.type === 'Ready');
    return readyCondition?.status === 'True';
  });

  function getLegend() {
    if (items === null) {
      return null;
    }
    return t('translation|{{ numReady }} / {{ numItems }} Requested', {
      numReady: podsReady.length,
      numItems: items.length,
    });
  }

  function getLabel() {
    if (items === null) {
      return '…';
    }
    const percentage = ((podsReady.length / items.length) * 100).toFixed(1);
    return `${items.length === 0 ? 0 : percentage} %`;
  }

  function getData() {
    if (items === null) {
      return [];
    }

    return [
      {
        name: 'ready',
        value: podsReady.length,
      },
      {
        name: 'notReady',
        value: items.length - podsReady.length,
        fill: theme.palette.error.main,
      },
    ];
  }

  return (
    <TileChart
      data={getData()}
      total={items !== null ? items.length : -1}
      label={getLabel()}
      title={t('glossary|Pods')}
      legend={getLegend()}
    />
  );
}

export function NodesStatusCircleChart(props: { items: Node[] | null }) {
  const theme = useTheme();
  const { items } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  const nodesReady = (items || []).filter((node: Node) => {
    const readyCondition = node.status?.conditions?.find(condition => condition.type === 'Ready');
    return readyCondition?.status === 'True';
  });

  function getLegend() {
    if (items === null) {
      return null;
    }
    return t('translation|{{ numReady }} / {{ numItems }} Ready', {
      numReady: nodesReady.length,
      numItems: items.length,
    });
  }

  function getLabel() {
    if (items === null) {
      return '…';
    }
    const percentage = ((nodesReady.length / items.length) * 100).toFixed(1);
    return `${items.length === 0 ? 0 : percentage} %`;
  }

  function getData() {
    if (items === null) {
      return [];
    }

    return [
      {
        name: 'ready',
        value: nodesReady.length,
      },
      {
        name: 'notReady',
        value: items.length - nodesReady.length,
        fill: theme.palette.error.main,
      },
    ];
  }

  return (
    <TileChart
      data={getData()}
      total={items !== null ? items.length : -1}
      label={getLabel()}
      title={t('glossary|Nodes')}
      legend={getLegend()}
    />
  );
}
