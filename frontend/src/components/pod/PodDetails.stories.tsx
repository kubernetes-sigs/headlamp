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
import PodDetails from './Details';
import { podList } from './storyHelper';

export default {
  title: 'Pod/PodDetailsView',
  component: PodDetails,
  argTypes: {},
  decorators: [
    Story => {
      return <Story />;
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({
              items: [
                {
                  type: 'Normal',
                  reason: 'Created',
                  message: 'Created',
                  source: {
                    component: 'kubelet',
                  },
                  firstTimestamp: '2021-03-01T00:00:00Z',
                  lastTimestamp: '2021-03-01T00:00:00Z',
                  count: 1,
                },
              ],
            })
          ),
          http.get('http://localhost:4466/api/v1/pods', () => HttpResponse.json({})),
        ],
      },
    },
  },
} as Meta;

interface MockerStory {
  podName: string;
}

const Template: StoryFn<MockerStory> = args => {
  const { podName } = args;

  return (
    <TestContext routerMap={{ namespace: 'default', name: podName }}>
      <PodDetails />
    </TestContext>
  );
};

export const PullBackOff = Template.bind({});
PullBackOff.args = {
  podName: 'imagepullbackoff',
};
PullBackOff.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/pods/imagepullbackoff', () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'imagepullbackoff'))
        ),
      ],
    },
  },
};

export const Running = Template.bind({});
Running.args = {
  podName: 'running',
};
Running.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/pods/running', () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'running'))
        ),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      storyBase: null,
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/pods/terminated', () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'terminated'))
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({
            items: [
              {
                apiVersion: 'v1',
                kind: 'Event',
                metadata: {
                  name: 'nginx-deployment-12346',
                  namespace: 'default',
                  creationTimestamp: '2024-02-12T20:07:10Z',
                  uid: 'abc123456',
                  resourceVersion: '1',
                },
                involvedObject: {
                  kind: 'Pod',
                  name: 'nginx-deployment-abcd-1234567890',
                  namespace: 'default',
                  uid: 'b1234',
                },
                reason: 'FailedGetResourceMetric',
                message: 'failed to get cpu utilization: missing request for cpu',
                source: {
                  component: 'horizontal-pod-autoscaler',
                },
                firstTimestamp: null,
                lastTimestamp: null,
                type: 'Warning',
                series: {
                  count: 10,
                  lastObservedTime: '2024-02-13T15:42:17Z',
                },
                reportingComponent: '',
                reportingInstance: '',
              },
            ],
          })
        ),
      ],
    },
  },
};
Error.args = {
  podName: 'terminated',
};

export const LivenessFailed = Template.bind({});
LivenessFailed.args = {
  podName: 'liveness-http',
};
LivenessFailed.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/pods/liveness-http', () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'liveness-http'))
        ),
      ],
    },
  },
};

export const Initializing = Template.bind({});
Initializing.args = {
  podName: 'initializing',
};
Initializing.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/pods/initializing', () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'initializing'))
        ),
      ],
    },
  },
};

export const Successful = Template.bind({});
Successful.args = {
  podName: 'successful',
};
Successful.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/pods/successful', () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'successful'))
        ),
      ],
    },
  },
};
