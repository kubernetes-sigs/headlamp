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

import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import Details from './Details';
import { NODE_DETAILED_DATA, NODE_METRICS_DATA } from './storyHelper';

const emptyList = { kind: 'List', apiVersion: 'v1', metadata: {}, items: [] };

const podMetricsList = {
  kind: 'PodMetricsList',
  apiVersion: 'metrics.k8s.io/v1beta1',
  metadata: {},
  items: [],
};

// Node is cluster-scoped, so the pods and events it pulls in are queried
// cluster-wide (no namespace path segment). The kubelet summary stats are
// served by the node itself and are independent of metrics-server, so they
// belong here too.
const commonHandlers = [
  http.get('http://localhost:4466/api/v1/nodes/node', () => HttpResponse.json(NODE_DETAILED_DATA)),
  http.get('http://localhost:4466/api/v1/pods', () => HttpResponse.json(emptyList)),
  http.get('http://localhost:4466/api/v1/events', () => HttpResponse.json(emptyList)),
  http.get('http://localhost:4466/api/v1/nodes/node/proxy/stats/summary', () =>
    HttpResponse.json({
      node: {
        fs: {
          capacityBytes: 50000000000,
          usedBytes: 10000000000,
        },
      },
    })
  ),
];

const metricsHandlers = [
  http.get('http://localhost:4466/apis/metrics.k8s.io/v1beta1/nodes', () =>
    HttpResponse.json({
      kind: 'NodeMetricsList',
      apiVersion: 'metrics.k8s.io/v1beta1',
      metadata: {},
      items: NODE_METRICS_DATA,
    })
  ),
  http.get('http://localhost:4466/apis/metrics.k8s.io/v1beta1/pods', () =>
    HttpResponse.json(podMetricsList)
  ),
];

const notFound = () =>
  HttpResponse.json({ kind: 'Status', status: 'Failure', code: 404 }, { status: 404 });

// metrics-server unavailable: both the node and pod metrics APIs 404. The
// kubelet summary (ephemeral storage) still works, as it does on a real cluster.
const noMetricsHandlers = [
  http.get('http://localhost:4466/apis/metrics.k8s.io/v1beta1/nodes', notFound),
  http.get('http://localhost:4466/apis/metrics.k8s.io/v1beta1/pods', notFound),
];

export default {
  title: 'node/DetailsView',
  component: Details,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext routerMap={{ name: 'node' }}>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn = () => <Details />;

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [...commonHandlers, ...metricsHandlers],
    },
  },
};

export const NoMetrics = Template.bind({});
NoMetrics.parameters = {
  msw: {
    handlers: {
      story: [...commonHandlers, ...noMetricsHandlers],
    },
  },
};
