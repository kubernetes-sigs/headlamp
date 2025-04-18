import '../../../i18n/config';
import { useTranslation } from 'react-i18next';
import { KubeMetrics } from '../../../lib/k8s/cluster';
import Node from '../../../lib/k8s/node';
import Pod from '../../../lib/k8s/pod';
import { formatMetricValueUnit, parseCpu, parseRam } from '../../../lib/units';
import ResourceCircularChart, {
  CircularChartProps as ResourceCircularChartProps,
} from '../../common/Resource/CircularChart';

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
