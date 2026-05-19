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
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import { PodDebugTerminal } from './PodDebugTerminal';

// Mock Pod object for demonstration (all required fields)
const mockPod = new Pod(
  {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: {
      name: 'mock-pod',
      namespace: 'default',
      creationTimestamp: '2023-01-01T00:00:00Z',
      uid: 'mock-uid',
      resourceVersion: '123',
    },
    status: {
      phase: 'Running',
      ephemeralContainerStatuses: [],
      conditions: [],
      containerStatuses: [
        {
          name: 'main',
          image: 'busybox',
          imageID: 'docker-pullable://busybox@sha256:mock',
          containerID: 'containerd://mock-main',
          ready: true,
          restartCount: 0,
          state: {
            running: {
              startedAt: '2023-01-01T00:00:00Z',
            },
          },
          lastState: {},
        },
      ],
      startTime: '2023-01-01T00:00:00Z',
      hostIP: '192.168.1.1',
      podIP: '10.0.0.1',
    },
    spec: {
      containers: [{ name: 'main', image: 'busybox', imagePullPolicy: 'IfNotPresent' }],
      ephemeralContainers: [],
      nodeName: 'mock-node',
      restartPolicy: 'Always',
      serviceAccountName: 'default',
      serviceAccount: 'default',
      tolerations: [],
    },
  },
  'default'
);

/** Mock pod with multiple containers to demonstrate target selection */
const multiContainerPod = new Pod(
  {
    kind: 'Pod',
    apiVersion: 'v1',
    metadata: {
      name: 'multi-container-pod',
      namespace: 'default',
      creationTimestamp: '2023-01-01T00:00:00Z',
      uid: 'mock-uid-multi',
      resourceVersion: '456',
    },
    status: {
      phase: 'Running',
      ephemeralContainerStatuses: [],
      conditions: [],
      containerStatuses: [
        {
          name: 'app',
          image: 'nginx',
          imageID: 'docker-pullable://nginx@sha256:mock',
          containerID: 'containerd://mock-app',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: '2023-01-01T00:00:00Z' } },
          lastState: {},
        },
        {
          name: 'sidecar',
          image: 'fluentd',
          imageID: 'docker-pullable://fluentd@sha256:mock',
          containerID: 'containerd://mock-sidecar',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: '2023-01-01T00:00:00Z' } },
          lastState: {},
        },
      ],
      startTime: '2023-01-01T00:00:00Z',
      hostIP: '192.168.1.1',
      podIP: '10.0.0.2',
    },
    spec: {
      containers: [
        { name: 'app', image: 'nginx', imagePullPolicy: 'IfNotPresent' },
        { name: 'sidecar', image: 'fluentd', imagePullPolicy: 'IfNotPresent' },
      ],
      ephemeralContainers: [],
      nodeName: 'mock-node',
      restartPolicy: 'Always',
      serviceAccountName: 'default',
      serviceAccount: 'default',
      tolerations: [],
    },
  },
  'default'
);

export default {
  title: 'Pod/PodDebugTerminal',
  component: PodDebugTerminal,
  decorators: [
    Story => {
      // Initialize cluster settings with debug enabled
      localStorage.setItem(
        'cluster_settings.default',
        JSON.stringify({
          podDebugTerminal: {
            isEnabled: true,
          },
        })
      );

      // Set URL immediately, before any component renders
      const originalPath = window.location.pathname;
      const mockPath = '/c/default/namespace/default/name/mock-pod';
      window.history.replaceState({}, '', mockPath);

      // Wrapper component to handle cleanup
      const ClusterMockWrapper = () => {
        useEffect(() => {
          // Cleanup: restore original path when component unmounts
          return () => {
            window.history.replaceState({}, '', originalPath);
          };
        }, []);

        return (
          <TestContext>
            <Story />
          </TestContext>
        );
      };

      return <ClusterMockWrapper />;
    },
  ],
  parameters: {
    msw: {
      handlers: [
        // Mock authorization checks
        http.post(
          'http://localhost:4466/clusters/default/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
          () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
        ),
        // Mock the PATCH request to create ephemeral container
        http.patch(
          'http://localhost:4466/clusters/default/api/v1/namespaces/default/pods/:podName/ephemeralcontainers',
          async ({ params }) => {
            const podName = String(params.podName);

            const podData =
              podName === multiContainerPod.metadata.name
                ? multiContainerPod.jsonData
                : mockPod.jsonData;

            const debugContainerName = 'headlamp-debug';
            return HttpResponse.json({
              ...podData,
              spec: {
                ...podData.spec,
                ephemeralContainers: [
                  { name: debugContainerName, image: 'busybox', command: ['sh'] },
                ],
              },
              status: {
                ...podData.status,
                ephemeralContainerStatuses: [
                  {
                    name: debugContainerName,
                    image: 'busybox',
                    imageID: '',
                    ready: false,
                    restartCount: 0,
                    state: { running: { startedAt: '2023-01-01T00:00:01Z' } },
                    lastState: {},
                  },
                ],
              },
            });
          }
        ),
        // Mock the GET request to poll pod status — returns pod with running debug container
        // so PodDebugTerminal doesn't time out waiting for state.running
        http.get(
          'http://localhost:4466/clusters/default/api/v1/namespaces/default/pods/:podName',
          ({ params }) => {
            const podName = String(params.podName);
            const podData =
              podName === multiContainerPod.metadata.name
                ? multiContainerPod.jsonData
                : mockPod.jsonData;

            const debugContainerName = 'headlamp-debug';
            return HttpResponse.json({
              ...podData,
              spec: {
                ...podData.spec,
                ephemeralContainers: [
                  { name: debugContainerName, image: 'busybox', command: ['sh'] },
                ],
              },
              status: {
                ...podData.status,
                ephemeralContainerStatuses: [
                  {
                    name: debugContainerName,
                    image: 'busybox',
                    imageID: '',
                    ready: false,
                    restartCount: 0,
                    state: { running: { startedAt: '2023-01-01T00:00:01Z' } },
                    lastState: {},
                  },
                ],
              },
            });
          }
        ),
      ],
    },
  },
} as Meta<typeof PodDebugTerminal>;

const Template: StoryFn<typeof PodDebugTerminal> = args => <PodDebugTerminal {...args} />;

export const Default = Template.bind({});
Default.args = {
  item: mockPod,
};

/** Debug terminal targeting a specific container */
export const WithTargetContainer = Template.bind({});
WithTargetContainer.args = {
  item: mockPod,
  targetContainer: 'main',
};

export const MultiContainerWithTarget = Template.bind({});
MultiContainerWithTarget.args = {
  item: multiContainerPod,
  targetContainer: 'app',
};
