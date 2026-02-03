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
import { useEffect } from 'react';
import { TestContext } from '../../test';
import PodDetails from './Details';
import { podList } from './storyHelper';

const CLUSTER_NAME = 'default';
const NAMESPACE = 'default';
const MOCK_PATH = `/c/${CLUSTER_NAME}/namespace/${NAMESPACE}/name/pod`;
const API_BASE = `http://localhost:4466/clusters/${CLUSTER_NAME}/api/v1/namespaces/${NAMESPACE}`;
const PODS_URL = `${API_BASE}/pods`;
const PODS_URL_NO_CLUSTER = `http://localhost:4466/api/v1/namespaces/${NAMESPACE}/pods`;
const EVENTS_URL = `${API_BASE}/events`;
const AUTH_URL = `http://localhost:4466/clusters/${CLUSTER_NAME}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`;

// Store the initial path at module scope, so we can always restore to it
const INITIAL_PATH = window.location.pathname;

export default {
  title: 'Pod/PodDetailsView',
  component: PodDetails,
  argTypes: {},
  decorators: [
    Story => {
      // Initialize cluster settings for 'default' cluster with debug enabled by default
      localStorage.setItem(
        `cluster_settings.${CLUSTER_NAME}`,
        JSON.stringify({
          podDebugTerminal: {
            isEnabled: true,
          },
        })
      );

      // Always reset to initial path before story
      window.history.replaceState({}, '', INITIAL_PATH);
      // Set URL for this story
      window.history.replaceState({}, '', MOCK_PATH);

      // Wrapper component to handle cleanup
      const ClusterMockWrapper = () => {
        useEffect(() => {
          // Cleanup: restore to initial path when component unmounts
          return () => {
            window.history.replaceState({}, '', INITIAL_PATH);
          };
        }, []);

        return <Story />;
      };

      return <ClusterMockWrapper />;
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(EVENTS_URL, () =>
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
          http.get(`http://localhost:4466/clusters/${CLUSTER_NAME}/api/v1/pods`, () =>
            HttpResponse.json({})
          ),
          http.post(AUTH_URL, () =>
            HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
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
    <TestContext
      routerMap={{ cluster: CLUSTER_NAME, namespace: NAMESPACE, name: podName }}
      urlPrefix="/c"
    >
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
        http.get(`${PODS_URL}/imagepullbackoff`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'imagepullbackoff'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/imagepullbackoff`, () =>
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
        http.get(`${PODS_URL}/running`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'running'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/running`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'running'))
        ),
      ],
    },
  },
};

export const DebugDisabled = Template.bind({});
DebugDisabled.args = {
  podName: 'running',
};
DebugDisabled.decorators = [
  Story => {
    // Force override the global decorator's setting
    localStorage.setItem(
      `cluster_settings.${CLUSTER_NAME}`,
      JSON.stringify({
        podDebugTerminal: {
          isEnabled: false,
        },
      })
    );

    // Always reset to initial path before story
    window.history.replaceState({}, '', INITIAL_PATH);
    // Set URL for this story
    window.history.replaceState({}, '', MOCK_PATH);

    // Wrapper component to handle cleanup
    const ClusterMockWrapper = () => {
      useEffect(() => {
        // Cleanup: restore to initial path when component unmounts
        return () => {
          window.history.replaceState({}, '', INITIAL_PATH);
        };
      }, []);

      return <Story />;
    };

    return <ClusterMockWrapper />;
  },
];
DebugDisabled.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${PODS_URL}/running`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'running'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/running`, () =>
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
        http.get(PODS_URL, () => HttpResponse.json({})),
        http.get(PODS_URL_NO_CLUSTER, () => HttpResponse.json({})),
        http.get(`${PODS_URL}/terminated`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'terminated'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/terminated`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'terminated'))
        ),
        http.get(EVENTS_URL, () =>
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
        http.post(AUTH_URL, () =>
          HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
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
        http.get(`${PODS_URL}/liveness-http`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'liveness-http'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/liveness-http`, () =>
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
        http.get(`${PODS_URL}/initializing`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'initializing'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/initializing`, () =>
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
        http.get(`${PODS_URL}/successful`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'successful'))
        ),
        http.get(`${PODS_URL_NO_CLUSTER}/successful`, () =>
          HttpResponse.json(podList.find(pod => pod.metadata.name === 'successful'))
        ),
      ],
    },
  },
};
