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

import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import { Theme } from '@mui/material/styles';
import Switch from '@mui/material/Switch';
import { uniqBy } from 'lodash';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import type { ApiError } from '../../lib/k8s/api/v2/ApiError';
import { hasListResults } from '../../lib/k8s/api/v2/useKubeObjectList';
import Event from '../../lib/k8s/event';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import { useFilterFunc } from '../../lib/util';
import { useNamespaces } from '../../redux/filterSlice';
import { useTypedSelector } from '../../redux/hooks';
import { OverviewChart } from '../../redux/overviewChartsSlice';
import EventsLifetimeInfo from '../common/EventsLifetimeInfo';
import { DateLabel } from '../common/Label';
import { StatusLabel } from '../common/Label';
import Link from '../common/Link';
import { PageGrid } from '../common/Resource';
import ResourceListView from '../common/Resource/ResourceListView';
import { SectionBox } from '../common/SectionBox';
import ShowHideLabel from '../common/ShowHideLabel';
import TileChart from '../common/TileChart';
import { LightTooltip } from '../common/Tooltip';
import {
  CpuCircularChart,
  MemoryCircularChart,
  NodesStatusCircleChart,
  PodsStatusCircleChart,
} from './Charts';
import { ClusterGroupErrorMessage } from './ClusterGroupErrorMessage';

const OVERVIEW_REFETCH_INTERVAL_MS = 60_000;

/**
 * Renders a chart, or a placeholder when its resources could not be listed at all. A list
 * spanning several namespaces or clusters reports an error while still returning what the
 * other requests found, so the chart stays as long as one of them answered. A request that
 * answered with nothing counts: an empty namespace really does hold zero of a resource. The
 * reason is reported once for the whole section rather than in every chart it affects.
 */
function ChartSlot({
  errors,
  hasData,
  title,
  children,
}: {
  errors?: ApiError[] | null;
  hasData?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation(['translation']);

  if (!!errors?.length && !hasData) {
    return <TileChart title={title} legend={t('translation|Unavailable')} />;
  }

  return <>{children}</>;
}

export default function Overview() {
  const { t } = useTranslation(['translation', 'glossary']);
  const namespaces = useNamespaces();

  // The overview only needs periodic snapshots for aggregate charts. Avoid long-lived
  // watches here because large clusters can stream enough events to exhaust the tab.
  const podsQuery = Pod.useList({
    namespace: namespaces,
    refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
  });
  const nodesQuery = Node.useList({ refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS });
  const [nodeMetrics, metricsError] = Node.useMetrics();
  const chartProcessors = useTypedSelector(state => state.overviewCharts.processors);

  // A list fans out over the namespaces and clusters it was asked for and reports an error
  // for each request that failed. Keep every one of them: reading only the first hides a
  // later failure with another status, and with it the hint its status would have raised.
  const pods = podsQuery.items;
  const podsErrors = podsQuery.errors;
  const nodes = nodesQuery.items;
  const nodesErrors = nodesQuery.errors;

  // A namespace that answered with nothing contributes a real zero, so the charts go by
  // whether any request answered rather than by whether the answer holds an item.
  const hasPods = hasListResults(podsQuery);
  const hasNodes = hasListResults(nodesQuery);

  const forbiddenMetrics = metricsError?.status === 403 ? metricsError : null;
  const noMetrics = metricsError !== null && !forbiddenMetrics;

  // A forbidden metrics response leaves the usage charts with nothing to sum, and summing
  // nothing reads as 0 usage rather than as the missing permission it is.
  const hasNodeUsage = hasNodes && (!forbiddenMetrics || !!nodeMetrics?.length);

  // The usage charts are the nodes they sum as much as the metrics they sum them with.
  const usageErrors = React.useMemo(
    () => [...(nodesErrors ?? []), forbiddenMetrics].filter((error): error is ApiError => !!error),
    [nodesErrors, forbiddenMetrics]
  );

  const chartErrors = React.useMemo(
    () => uniqBy([...(podsErrors ?? []), ...usageErrors], error => error.status),
    [podsErrors, usageErrors]
  );

  // Only namespaced resources can be narrowed to the namespaces a restricted user may read.
  const forbiddenPods = !!podsErrors?.some(error => error.status === 403);

  // Process the default charts through any registered processors
  const defaultCharts: OverviewChart[] = [
    {
      id: 'cpu',
      component: () => (
        <ChartSlot errors={usageErrors} hasData={hasNodeUsage} title={t('glossary|CPU')}>
          <CpuCircularChart items={nodes} itemsMetrics={nodeMetrics} noMetrics={noMetrics} />
        </ChartSlot>
      ),
    },
    {
      id: 'memory',
      component: () => (
        <ChartSlot errors={usageErrors} hasData={hasNodeUsage} title={t('glossary|Memory')}>
          <MemoryCircularChart items={nodes} itemsMetrics={nodeMetrics} noMetrics={noMetrics} />
        </ChartSlot>
      ),
    },
    {
      id: 'pods',
      component: () => (
        <ChartSlot errors={podsErrors} hasData={hasPods} title={t('glossary|Pods')}>
          <PodsStatusCircleChart items={pods} />
        </ChartSlot>
      ),
    },
    {
      id: 'nodes',
      component: () => (
        <ChartSlot errors={nodesErrors} hasData={hasNodes} title={t('glossary|Nodes')}>
          <NodesStatusCircleChart items={nodes} pods={pods} podsLoaded={podsQuery.isSuccess} />
        </ChartSlot>
      ),
    },
  ];
  const charts = chartProcessors.reduce(
    (currentCharts, p) => p.processor(currentCharts),
    defaultCharts
  );

  return (
    <PageGrid>
      <SectionBox title={t('translation|Overview')} py={2} mt={[4, 0, 0]}>
        <ClusterGroupErrorMessage errors={chartErrors} namespacedResource={forbiddenPods} />
        <Grid container justifyContent="flex-start" alignItems="stretch" spacing={4}>
          {charts.map(chart => (
            <Grid key={chart.id} item xs sx={{ maxWidth: '300px' }}>
              <chart.component />
            </Grid>
          ))}
        </Grid>
      </SectionBox>
      <EventsSection />
    </PageGrid>
  );
}

function EventsSection() {
  const EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY = 'EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY';
  const EVENT_WARNING_SWITCH_DEFAULT = true;
  const { t } = useTranslation(['translation', 'glossary']);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const eventsFilter = queryParams.get('eventsFilter');
  const filterFunc = useFilterFunc<Event>(['.jsonData.involvedObject.kind']);
  const [isWarningEventSwitchChecked, setIsWarningEventSwitchChecked] = React.useState(
    Boolean(
      JSON.parse(
        localStorage.getItem(EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY) ||
          EVENT_WARNING_SWITCH_DEFAULT.toString()
      )
    )
  );
  const namespace = useNamespaces();
  const { items: events, errors: eventsErrors } = Event.useList({
    limit: Event.maxLimit,
    namespace,
    refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
  });

  const warningActionFilterFunc = (event: Event, search?: string) => {
    if (!filterFunc(event, search)) {
      return false;
    }

    if (isWarningEventSwitchChecked) {
      return event.jsonData.type === 'Warning';
    }

    // Return true because if we reach this point, it means we're only filtering by
    // the default filterFunc (and its result was 'true').
    return true;
  };

  const numWarnings = React.useMemo(
    () => events?.filter(e => e.type === 'Warning').length ?? '?',
    [events]
  );

  function makeStatusLabel(event: Event) {
    return (
      <StatusLabel
        status={event.type === 'Normal' ? '' : 'warning'}
        sx={(theme: Theme) => ({
          [theme.breakpoints.up('md')]: {
            display: 'unset',
          },
        })}
      >
        {event.reason}
      </StatusLabel>
    );
  }

  function makeObjectLink(event: Event) {
    const obj = event.involvedObjectInstance;
    if (!!obj) {
      return <Link kubeObject={obj} />;
    }

    return event.involvedObject.name;
  }

  return (
    <ResourceListView
      title={t('glossary|Events')}
      headerProps={{
        noNamespaceFilter: false,
        titleSideActions: [
          <EventsLifetimeInfo key="event-lifetime-info" />,
          <FormControlLabel
            checked={isWarningEventSwitchChecked}
            label={t('Only warnings ({{ numWarnings }})', { numWarnings })}
            control={<Switch color="primary" />}
            onChange={(event, checked) => {
              localStorage.setItem(EVENT_WARNING_SWITCH_FILTER_STORAGE_KEY, checked.toString());
              setIsWarningEventSwitchChecked(checked);
            }}
            key="warning-toggle"
          />,
        ],
      }}
      defaultGlobalFilter={eventsFilter ?? undefined}
      data={events}
      errors={eventsErrors}
      columns={[
        {
          id: 'type',
          label: t('Type'),
          gridTemplate: 'min-content',
          filterVariant: 'multi-select',
          getValue: event => event.involvedObject.kind,
        },
        {
          id: 'name',
          label: t('Name'),
          getValue: event => event.involvedObjectInstance?.getName() ?? event.involvedObject.name,
          render: event => makeObjectLink(event),
          gridTemplate: 'auto',
        },
        'namespace',
        'cluster',
        {
          id: 'node',
          label: t('glossary|Node'),
          gridTemplate: 'min-content',
          filterVariant: 'multi-select',
          getValue: event => event.source?.host ?? '',
        },
        {
          id: 'reason',
          label: t('Reason'),
          gridTemplate: 'min-content',
          filterVariant: 'multi-select',
          getValue: event => event.reason,
          render: event => (
            <LightTooltip title={event.reason} interactive>
              {makeStatusLabel(event)}
            </LightTooltip>
          ),
        },
        {
          id: 'message',
          label: t('Message'),
          getValue: event => event.message ?? '',
          render: event => (
            <ShowHideLabel labelId={event.metadata?.uid || ''}>{event.message || ''}</ShowHideLabel>
          ),
          gridTemplate: 'auto',
        },
        {
          id: 'count',
          label: t('Count'),
          gridTemplate: 'min-content',
          cellProps: { align: 'right' },
          getValue: event => event.count ?? null,
          render: event => event.count ?? '-',
        },
        {
          id: 'last-seen',
          label: t('Last Seen'),
          gridTemplate: 'min-content',
          cellProps: { align: 'right' },
          getValue: event => -new Date(event.lastOccurrence).getTime(),
          render: event => <DateLabel date={event.lastOccurrence} format="mini" />,
        },
      ]}
      filterFunction={warningActionFilterFunc}
      defaultSortingColumn={{ id: 'last-seen', desc: false }}
      id="headlamp-cluster.overview.events"
    />
  );
}
