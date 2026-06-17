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
import { JOB_COMPLETE, JOB_RUNNING } from './storyHelper';

const emptyList = (kind: string, apiVersion: string) => ({
  kind,
  apiVersion,
  metadata: {},
  items: [],
});

const podMetricsList = {
  kind: 'PodMetricsList',
  apiVersion: 'metrics.k8s.io/v1beta1',
  metadata: {},
  items: [],
};

// Jobs are namespaced, so the owned pods, pod metrics and events the details
// view pulls in are all queried under the job's namespace. The job collection
// path is also handled because the details view fires a watch on it in addition
// to the get-by-name request. Each list handler returns its proper Kubernetes
// list kind so the mocked responses match the real API shape.
const commonHandlers = [
  http.get('http://localhost:4466/apis/batch/v1/namespaces/default/jobs', () =>
    HttpResponse.json(emptyList('JobList', 'batch/v1'))
  ),
  http.get('http://localhost:4466/api/v1/namespaces/default/pods', () =>
    HttpResponse.json(emptyList('PodList', 'v1'))
  ),
  http.get('http://localhost:4466/apis/metrics.k8s.io/v1beta1/namespaces/default/pods', () =>
    HttpResponse.json(podMetricsList)
  ),
  http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
    HttpResponse.json(emptyList('EventList', 'v1'))
  ),
];

export default {
  title: 'job/JobDetailsView',
  component: Details,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext routerMap={{ namespace: 'default', name: 'hello' }}>
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
      story: [
        http.get('http://localhost:4466/apis/batch/v1/namespaces/default/jobs/hello', () =>
          HttpResponse.json(JOB_COMPLETE)
        ),
        ...commonHandlers,
      ],
    },
  },
};

export const Running = Template.bind({});
Running.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/batch/v1/namespaces/default/jobs/hello', () =>
          HttpResponse.json(JOB_RUNNING)
        ),
        ...commonHandlers,
      ],
    },
  },
};
