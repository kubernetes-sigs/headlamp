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

import { FormControlLabel, Switch, Theme } from '@mui/material';
import Grid from '@mui/material/Grid';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import Event from '../../lib/k8s/event';
import Node from '../../lib/k8s/node';
import Pod from '../../lib/k8s/pod';
import { useFilterFunc } from '../../lib/util';
import { OverviewChart } from '../../redux/overviewChartsSlice';
import { useTypedSelector } from '../../redux/reducers/reducers';
import { DateLabel, Link, PageGrid, StatusLabel } from '../common';
import ResourceListView from '../common/Resource/ResourceListView';
import { SectionBox } from '../common/SectionBox';
import ShowHideLabel from '../common/ShowHideLabel';
import { LightTooltip } from '../common/Tooltip';
import {
  CpuCircularChart,
  MemoryCircularChart,
  NodesStatusCircleChart,
  PodsStatusCircleChart,
} from './Charts';
import { ClusterGroupErrorMessage } from './ClusterGroupErrorMessage';

export default function Overview() {
  const { t } = useTranslation(['translation']);
  const [pods] = Pod.useList();
  const [nodes] = Node.useList();
  const [nodeMetrics, metricsError] = Node.useMetrics();
  const chartProcessors = useTypedSelector(state => state.overviewCharts.processors);

  const noMetrics = metricsError?.status === 404;
  const noPermissions = metricsError?.status === 403;

  // Process the default charts through any registered processors
  const defaultCharts: OverviewChart[] = [
    {
      id: 'cpu',
      component: () => (
        <CpuCircularChart items={nodes} itemsMetrics={nodeMetrics} noMetrics={noMetrics} />
      ),
    },
    {
      id: 'memory',
      component: () => (
        <MemoryCircularChart items={nodes} itemsMetrics={nodeMetrics} noMetrics={noMetrics} />
      ),
    },
    {
      id: 'pods',
      component: () => <PodsStatusCircleChart items={pods} />,
    },
    {
      id: 'nodes',
      component: () => <NodesStatusCircleChart items={nodes} />,
    },
  ];
  const charts = chartProcessors.reduce(
    (currentCharts, p) => p.processor(currentCharts),
    defaultCharts
  );

  return (
    <PageGrid>
      <SectionBox title={t('translation|Overview')} py={2} mt={[4, 0, 0]}>
        {noPermissions ? (
          <ClusterGroupErrorMessage errors={[metricsError]} />
        ) : (
          <Grid container justifyContent="flex-start" alignItems="stretch" spacing={4}>
            {charts.map(chart => (
              <Grid key={chart.id} item xs sx={{ maxWidth: '300px' }}>
                <chart.component />
              </Grid>
            ))}
          </Grid>
        )}
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
  const { items: events, errors: eventsErrors } = Event.useList({ limit: Event.maxLimit });

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
          label: t('Type'),
          gridTemplate: 'min-content',
          getValue: event => event.involvedObject.kind,
        },
        {
          label: t('Name'),
          getValue: event => event.involvedObjectInstance?.getName() ?? event.involvedObject.name,
          render: event => makeObjectLink(event),
          gridTemplate: 'auto',
        },
        'namespace',
        'cluster',
        {
          label: t('Reason'),
          gridTemplate: 'min-content',
          getValue: event => event.reason,
          render: event => (
            <LightTooltip title={event.reason} interactive>
              {makeStatusLabel(event)}
            </LightTooltip>
          ),
        },
        {
          label: t('Message'),
          getValue: event => event.message ?? '',
          render: event => (
            <ShowHideLabel labelId={event.metadata?.uid || ''}>{event.message || ''}</ShowHideLabel>
          ),
          gridTemplate: 'auto',
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
