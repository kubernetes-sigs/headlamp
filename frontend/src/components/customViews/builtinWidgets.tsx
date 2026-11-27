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
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ResourceClasses } from '../../lib/k8s';
import Event from '../../lib/k8s/event';
import type { KubeObject, KubeObjectClass } from '../../lib/k8s/KubeObject';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import type {
  CustomViewWidgetConfigProps,
  CustomViewWidgetDefinition,
  CustomViewWidgetRenderProps,
} from '../../redux/customViewsSlice';
import { useTypedSelector } from '../../redux/hooks';
import type { OverviewChart } from '../../redux/overviewChartsSlice';
import {
  CpuCircularChart,
  MemoryCircularChart,
  NodesStatusCircleChart,
  PodsStatusCircleChart,
} from '../cluster/Charts';
import Empty from '../common/EmptyContent';
import { DateLabel, StatusLabel } from '../common/Label';
import Loader from '../common/Loader';
import { ResourceLink } from '../common/Resource';
import { LOGGABLE_WORKLOAD_KINDS, WorkloadLogs } from '../common/Resource/LogsButton';
import SimpleTable, { NameValueTable } from '../common/SimpleTable';
import { PodLogViewer } from '../pod/Details';
import {
  BUILTIN_VIEW_WIDGET_METADATA,
  BUILTIN_WIDGET_TYPES,
  LOGGABLE_RESOURCE_KINDS,
} from './builtinWidgetMetadata';

export { BUILTIN_WIDGET_TYPES };

function getAvailableResourceKinds(): string[] {
  return Object.keys(ResourceClasses ?? {}).sort();
}

function findResourceClass(kind: string | undefined): KubeObjectClass | undefined {
  if (!kind) {
    return undefined;
  }

  const exact = (ResourceClasses as Record<string, KubeObjectClass>)[kind];
  if (exact) {
    return exact;
  }

  const normalized = kind.trim().toLowerCase();
  const matchKey = Object.keys(ResourceClasses).find(k => k.toLowerCase() === normalized);
  return matchKey ? (ResourceClasses as Record<string, KubeObjectClass>)[matchKey] : undefined;
}

function getResourceSummaryStatus(item: KubeObject): {
  label: string;
  status: 'success' | 'warning' | 'error' | '';
} {
  const statusObj = item.jsonData?.status;
  if (statusObj?.phase) {
    const phase = String(statusObj.phase);
    const status =
      phase === 'Running' || phase === 'Succeeded' || phase === 'Active'
        ? 'success'
        : phase === 'Failed'
        ? 'error'
        : 'warning';
    return { label: phase, status };
  }

  if (typeof statusObj?.replicas === 'number') {
    const ready = statusObj.readyReplicas ?? 0;
    const total = statusObj.replicas;
    return {
      label: `${ready}/${total} ready`,
      status: ready >= total ? 'success' : 'warning',
    };
  }

  const conditions: Array<{ type?: string; status?: string }> = statusObj?.conditions ?? [];
  const readyCondition = conditions.find(c => c.type === 'Ready' || c.type === 'Available');
  if (readyCondition) {
    const isTrue = readyCondition.status === 'True';
    return {
      label: `${readyCondition.type}: ${readyCondition.status}`,
      status: isTrue ? 'success' : 'warning',
    };
  }

  return { label: item.kind, status: '' };
}

function ResourceTargetConfigEditor({
  config,
  onChange,
  kinds,
  requireName = true,
  allowContainer = false,
}: {
  config: Record<string, any>;
  onChange: (nextConfig: Record<string, any>) => void;
  kinds: string[];
  requireName?: boolean;
  allowContainer?: boolean;
}) {
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
      <FormControl fullWidth size="small">
        <InputLabel id="custom-view-resource-kind-label">{t('glossary|Kind')}</InputLabel>
        <Select
          labelId="custom-view-resource-kind-label"
          label={t('glossary|Kind')}
          value={config.kind ?? kinds[0] ?? 'Pod'}
          onChange={e => onChange({ ...config, kind: e.target.value })}
        >
          {kinds.map(kind => (
            <MenuItem key={kind} value={kind}>
              {kind}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        size="small"
        fullWidth
        label={t('glossary|Namespace')}
        placeholder={t('translation|Leave blank for cluster-scoped or all namespaces')}
        value={config.namespace ?? ''}
        onChange={e => onChange({ ...config, namespace: e.target.value })}
      />
      {requireName && (
        <TextField
          size="small"
          fullWidth
          required
          label={t('translation|Resource Name')}
          value={config.name ?? ''}
          onChange={e => onChange({ ...config, name: e.target.value })}
        />
      )}
      {allowContainer && (
        <TextField
          size="small"
          fullWidth
          label={t('glossary|Container')}
          placeholder={t('translation|Optional container name')}
          value={config.container ?? ''}
          onChange={e => onChange({ ...config, container: e.target.value })}
        />
      )}
    </Box>
  );
}

function ResourceDetailsWidget({ config, cluster }: CustomViewWidgetRenderProps) {
  const { t } = useTranslation(['translation', 'glossary']);
  const resourceClass = findResourceClass(config.kind);
  const targetCluster = config.cluster || cluster || undefined;
  const targetNamespace = config.namespace || undefined;

  if (!resourceClass || !config.name) {
    return (
      <Empty>{t('translation|Configure a resource kind and name to display its details.')}</Empty>
    );
  }

  return (
    <ResourceDetailsContent
      resourceClass={resourceClass}
      name={config.name}
      namespace={targetNamespace}
      cluster={targetCluster}
    />
  );
}

function ResourceDetailsContent({
  resourceClass,
  name,
  namespace,
  cluster,
}: {
  resourceClass: KubeObjectClass;
  name: string;
  namespace?: string;
  cluster?: string;
}) {
  const { t } = useTranslation(['translation', 'glossary']);
  const [item, error] = resourceClass.useGet(name, namespace, { cluster });

  if (error) {
    return <Empty color="error">{error.message}</Empty>;
  }

  if (!item) {
    return <Loader title={t('translation|Loading resource data')} />;
  }

  const summary = getResourceSummaryStatus(item);
  const labels = Object.entries(item.metadata?.labels ?? {}).slice(0, 6);

  return (
    <Box>
      <NameValueTable
        rows={[
          {
            name: t('translation|Name'),
            value: <ResourceLink resource={item} />,
          },
          {
            name: t('glossary|Kind'),
            value: item.kind,
          },
          {
            name: t('glossary|Namespace'),
            value: item.getNamespace() || t('translation|Cluster-wide'),
            hide: !item.getNamespace(),
          },
          {
            name: t('translation|Status'),
            value: <StatusLabel status={summary.status}>{summary.label}</StatusLabel>,
          },
          {
            name: t('translation|Age'),
            value: <DateLabel date={item.metadata.creationTimestamp} />,
          },
          {
            name: t('glossary|Labels'),
            value: (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {labels.map(([k, v]) => (
                  <Chip key={k} size="small" variant="outlined" label={`${k}=${v}`} />
                ))}
              </Box>
            ),
            hide: labels.length === 0,
          },
        ]}
      />
    </Box>
  );
}

function ResourceLogsWidget({ config, cluster }: CustomViewWidgetRenderProps) {
  const { t } = useTranslation(['translation', 'glossary']);
  const resourceClass = findResourceClass(config.kind);
  const targetCluster = config.cluster || cluster || undefined;
  const targetNamespace = config.namespace || undefined;

  if (
    !resourceClass ||
    !config.name ||
    !(LOGGABLE_RESOURCE_KINDS as readonly string[]).includes(resourceClass.kind ?? config.kind)
  ) {
    return (
      <Empty>
        {t('translation|Configure a Pod or workload resource to stream logs in this view.')}
      </Empty>
    );
  }

  return (
    <ResourceLogsContent
      resourceClass={resourceClass}
      name={config.name}
      namespace={targetNamespace}
      cluster={targetCluster}
      container={config.container}
    />
  );
}

function ResourceLogsContent({
  resourceClass,
  name,
  namespace,
  cluster,
  container,
}: {
  resourceClass: KubeObjectClass;
  name: string;
  namespace?: string;
  cluster?: string;
  container?: string;
}) {
  const { t } = useTranslation(['translation']);
  const [item, error] = resourceClass.useGet(name, namespace, { cluster });

  if (error) {
    return <Empty color="error">{error.message}</Empty>;
  }

  if (!item) {
    return <Loader title={t('translation|Loading logs')} />;
  }

  return (
    <Box sx={{ height: 360, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {Pod.isClassOf(item) ? (
        <PodLogViewer noDialog open item={item} initialContainer={container} onClose={() => {}} />
      ) : (
        <WorkloadLogs item={item} />
      )}
    </Box>
  );
}

function ResourceEventsWidget({ config, cluster }: CustomViewWidgetRenderProps) {
  const { t } = useTranslation(['translation', 'glossary']);
  const targetCluster = config.cluster || cluster || undefined;
  const { items: events, error } = Event.useList({
    namespace: config.namespace || undefined,
    cluster: targetCluster,
    limit: 200,
  });

  if (error) {
    return <Empty color="error">{error.message}</Empty>;
  }

  if (events === null) {
    return <Loader title={t('translation|Loading events')} />;
  }

  const filteredEvents = events
    .filter(event => {
      if (config.warningOnly && event.jsonData.type !== 'Warning') {
        return false;
      }
      if (config.kind && event.involvedObject?.kind !== config.kind) {
        return false;
      }
      if (config.name && event.involvedObject?.name !== config.name) {
        return false;
      }
      return true;
    })
    .slice(0, 25);

  if (filteredEvents.length === 0) {
    return <Empty>{t('translation|No events found for this filter.')}</Empty>;
  }

  return (
    <Box sx={{ maxHeight: 340, overflow: 'auto' }}>
      <SimpleTable
        data={filteredEvents}
        columns={[
          {
            label: t('translation|Reason'),
            getter: event => (
              <StatusLabel status={event.type === 'Normal' ? '' : 'warning'}>
                {event.reason}
              </StatusLabel>
            ),
          },
          {
            label: t('translation|Object'),
            getter: event =>
              `${event.involvedObject?.kind ?? ''}/${event.involvedObject?.name ?? ''}`,
          },
          {
            label: t('translation|Message'),
            getter: event => event.message,
          },
          {
            label: t('translation|Age'),
            getter: event => <DateLabel date={event.lastOccurrence} />,
          },
        ]}
      />
    </Box>
  );
}

function ResourceEventsConfigEditor({ config, onChange }: CustomViewWidgetConfigProps) {
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
      <TextField
        size="small"
        fullWidth
        label={t('glossary|Namespace')}
        placeholder={t('translation|Optional namespace filter')}
        value={config.namespace ?? ''}
        onChange={e => onChange({ ...config, namespace: e.target.value })}
      />
      <TextField
        size="small"
        fullWidth
        label={t('glossary|Kind')}
        placeholder={t('translation|Optional resource kind (e.g. Pod)')}
        value={config.kind ?? ''}
        onChange={e => onChange({ ...config, kind: e.target.value })}
      />
      <TextField
        size="small"
        fullWidth
        label={t('translation|Resource Name')}
        placeholder={t('translation|Optional resource name')}
        value={config.name ?? ''}
        onChange={e => onChange({ ...config, name: e.target.value })}
      />
      <FormControlLabel
        control={
          <Switch
            checked={Boolean(config.warningOnly)}
            onChange={e => onChange({ ...config, warningOnly: e.target.checked })}
          />
        }
        label={t('translation|Warnings only')}
      />
    </Box>
  );
}

function ClusterMetricsWidget({ config, cluster }: CustomViewWidgetRenderProps) {
  const { t } = useTranslation(['translation', 'glossary']);
  const targetCluster = config.cluster || cluster || undefined;
  const podsQuery = Pod.useList({ cluster: targetCluster, refetchInterval: 60_000 });
  const [pods] = podsQuery;
  const [nodes] = Node.useList({ cluster: targetCluster, refetchInterval: 60_000 });
  const [nodeMetrics, metricsError] = Node.useMetrics();
  const chartProcessors = useTypedSelector(state => state?.overviewCharts?.processors ?? []);

  const noPermissions = metricsError?.status === 403;
  const noMetrics = metricsError !== null && !noPermissions;
  const selectedMetric = config.metric ?? 'all';

  if (noPermissions && metricsError) {
    return <Empty color="error">{metricsError.message}</Empty>;
  }

  const allCharts: OverviewChart[] = [
    {
      id: 'cpu',
      component: () => (
        <CpuCircularChart
          items={nodes}
          itemsMetrics={nodeMetrics}
          noMetrics={noMetrics}
          metricsError={metricsError}
        />
      ),
    },
    {
      id: 'memory',
      component: () => (
        <MemoryCircularChart
          items={nodes}
          itemsMetrics={nodeMetrics}
          noMetrics={noMetrics}
          metricsError={metricsError}
        />
      ),
    },
    {
      id: 'pods',
      component: () => <PodsStatusCircleChart items={pods} />,
    },
    {
      id: 'nodes',
      component: () => (
        <NodesStatusCircleChart items={nodes} pods={pods} podsLoaded={podsQuery.isSuccess} />
      ),
    },
  ];

  const charts =
    selectedMetric === 'all'
      ? chartProcessors.reduce((currentCharts, p) => p.processor(currentCharts), allCharts)
      : allCharts.filter(chart => chart.id === selectedMetric);

  if (charts.length === 0) {
    return <Empty>{t('translation|No metrics available.')}</Empty>;
  }

  return (
    <Grid container justifyContent="flex-start" alignItems="stretch" spacing={2}>
      {charts.map(chart => (
        <Grid key={chart.id} item xs={12} sm={charts.length === 1 ? 12 : 6}>
          <chart.component />
        </Grid>
      ))}
    </Grid>
  );
}

function ClusterMetricsConfigEditor({ config, onChange }: CustomViewWidgetConfigProps) {
  const { t } = useTranslation(['translation', 'glossary']);

  return (
    <FormControl fullWidth size="small" sx={{ mt: 1 }}>
      <InputLabel id="custom-view-metric-type-label">{t('translation|Metric')}</InputLabel>
      <Select
        labelId="custom-view-metric-type-label"
        label={t('translation|Metric')}
        value={config.metric ?? 'all'}
        onChange={e => onChange({ ...config, metric: e.target.value })}
      >
        <MenuItem value="all">{t('translation|All Overview Metrics')}</MenuItem>
        <MenuItem value="cpu">{t('glossary|CPU Usage')}</MenuItem>
        <MenuItem value="memory">{t('translation|Memory Usage')}</MenuItem>
        <MenuItem value="pods">{t('glossary|Pods')}</MenuItem>
        <MenuItem value="nodes">{t('glossary|Nodes')}</MenuItem>
      </Select>
    </FormControl>
  );
}

function ResourceListWidget({ config, cluster }: CustomViewWidgetRenderProps) {
  const { t } = useTranslation(['translation', 'glossary']);
  const resourceClass = findResourceClass(config.kind ?? 'Pod');
  const targetCluster = config.cluster || cluster || undefined;

  if (!resourceClass) {
    return <Empty>{t('translation|Select a valid Kubernetes resource kind.')}</Empty>;
  }

  return (
    <ResourceListContent
      resourceClass={resourceClass}
      namespace={config.namespace || undefined}
      cluster={targetCluster}
      labelSelector={config.labelSelector || undefined}
    />
  );
}

function ResourceListContent({
  resourceClass,
  namespace,
  cluster,
  labelSelector,
}: {
  resourceClass: KubeObjectClass;
  namespace?: string;
  cluster?: string;
  labelSelector?: string;
}) {
  const { t } = useTranslation(['translation', 'glossary']);
  const { items, error } = resourceClass.useList({
    namespace,
    cluster,
    ...(labelSelector ? { labelSelector } : {}),
  });

  if (error) {
    return <Empty color="error">{error.message}</Empty>;
  }

  if (items === null) {
    return <Loader title={t('translation|Loading resources')} />;
  }

  const displayedItems = items.slice(0, 25);
  if (displayedItems.length === 0) {
    return <Empty>{t('translation|No resources found.')}</Empty>;
  }

  return (
    <Box sx={{ maxHeight: 340, overflow: 'auto' }}>
      <SimpleTable
        data={displayedItems}
        columns={[
          {
            label: t('translation|Name'),
            getter: item => <ResourceLink resource={item} />,
          },
          {
            label: t('glossary|Namespace'),
            getter: item => item.getNamespace() || '-',
          },
          {
            label: t('translation|Status'),
            getter: item => {
              const summary = getResourceSummaryStatus(item);
              return <StatusLabel status={summary.status}>{summary.label}</StatusLabel>;
            },
          },
          {
            label: t('translation|Age'),
            getter: item => <DateLabel date={item.metadata.creationTimestamp} />,
          },
        ]}
      />
    </Box>
  );
}

function ResourceListConfigEditor({ config, onChange }: CustomViewWidgetConfigProps) {
  const { t } = useTranslation(['translation', 'glossary']);

  const resourceKinds = getAvailableResourceKinds();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
      <ResourceTargetConfigEditor
        config={config}
        onChange={onChange}
        kinds={resourceKinds}
        requireName={false}
      />
      <TextField
        size="small"
        fullWidth
        label={t('glossary|Label Selector')}
        placeholder="app=nginx"
        value={config.labelSelector ?? ''}
        onChange={e => onChange({ ...config, labelSelector: e.target.value })}
      />
      <Typography variant="caption" color="text.secondary">
        {t('translation|Displays up to 25 live matching resources.')}
      </Typography>
    </Box>
  );
}

export const BUILTIN_VIEW_WIDGETS: CustomViewWidgetDefinition<any>[] =
  BUILTIN_VIEW_WIDGET_METADATA.map(meta => {
    switch (meta.type) {
      case BUILTIN_WIDGET_TYPES.RESOURCE_DETAILS:
        return {
          ...meta,
          component: props => <ResourceDetailsWidget {...props} />,
          configComponent: props => (
            <ResourceTargetConfigEditor {...props} kinds={getAvailableResourceKinds()} />
          ),
        };
      case BUILTIN_WIDGET_TYPES.RESOURCE_LOGS:
        return {
          ...meta,
          component: props => <ResourceLogsWidget {...props} />,
          configComponent: props => (
            <ResourceTargetConfigEditor
              {...props}
              kinds={['Pod', ...Array.from(LOGGABLE_WORKLOAD_KINDS)].sort()}
              allowContainer
            />
          ),
        };
      case BUILTIN_WIDGET_TYPES.RESOURCE_EVENTS:
        return {
          ...meta,
          component: props => <ResourceEventsWidget {...props} />,
          configComponent: props => <ResourceEventsConfigEditor {...props} />,
        };
      case BUILTIN_WIDGET_TYPES.CLUSTER_METRICS:
        return {
          ...meta,
          component: props => <ClusterMetricsWidget {...props} />,
          configComponent: props => <ClusterMetricsConfigEditor {...props} />,
        };
      case BUILTIN_WIDGET_TYPES.RESOURCE_LIST:
      default:
        return {
          ...meta,
          component: props => <ResourceListWidget {...props} />,
          configComponent: props => <ResourceListConfigEditor {...props} />,
        };
    }
  });
