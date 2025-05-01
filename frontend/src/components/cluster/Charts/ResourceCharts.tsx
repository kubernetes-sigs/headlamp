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
import { useTranslation } from 'react-i18next';
import { KubeMetrics } from '../../../lib/k8s/cluster';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { parseCpu, parseRam, TO_GB, TO_ONE_CPU } from '../../../lib/units';
import ResourceCircularChart, {
  CircularChartProps as ResourceCircularChartProps,
} from '../../common/Resource/CircularChart';

export function MemoryCircularChart(props: ResourceCircularChartProps) {
  const { noMetrics } = props;
  const { t } = useTranslation(['translation', 'glossary']);

  function memoryUsedGetter(item: KubeMetrics) {
    return parseRam(item.usage.memory) / TO_GB;
  }

  function memoryAvailableGetter(item: Node | Pod) {
    return parseRam(item.status?.capacity?.memory) / TO_GB;
  }

  function getLegend(used: number, available: number) {
    if (available === 0 || available === -1) {
      return '';
    }

    const availableLabel = `${available.toFixed(2)} GB`;
    if (noMetrics) {
      return availableLabel;
    }

    return `${used.toFixed(2)} / ${availableLabel}`;
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
    return parseCpu(item.usage.cpu) / TO_ONE_CPU;
  }

  function cpuAvailableGetter(item: Node | Pod) {
    return parseCpu(item.status?.capacity?.cpu) / TO_ONE_CPU;
  }

  function getLegend(used: number, available: number) {
    if (available === 0 || available === -1) {
      return '';
    }

    const availableLabel = t('translation|{{ available }} units', { available });
    if (noMetrics) {
      return availableLabel;
    }

    return `${used.toFixed(2)} / ${availableLabel}`;
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
