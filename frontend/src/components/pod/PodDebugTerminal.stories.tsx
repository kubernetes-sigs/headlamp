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

const mockPodsDb = new Map<string, any>();

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
      handlers: {
        story: [
          // Mock authorization checks
          http.post(
            /\/selfsubjectaccessreviews$/,
            () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
          // Mock the PATCH request to create ephemeral container
          http.patch(
            /\/ephemeralcontainers$/,
            async ({ request }) => {
              const url = new URL(request.url);
              const parts = url.pathname.split('/');
              const podName = parts[parts.length - 2];
              const body = (await request.json()) as any;
              const newEphemeral = body?.spec?.ephemeralContainers?.slice(-1)[0] || {};
              const targetContainerName = newEphemeral?.targetContainerName;

              const currentPodData = mockPodsDb.get(podName) || mockPod.jsonData;
              const debugContainerName = newEphemeral?.name || 'headlamp-debug';

              const updatedPod = {
                ...currentPodData,
                spec: {
                  ...currentPodData.spec,
                  ephemeralContainers: [
                    ...(currentPodData.spec.ephemeralContainers || []),
                    {
                      name: debugContainerName,
                      image: newEphemeral?.image || 'busybox',
                      command: newEphemeral?.command || ['sh'],
                      ...(targetContainerName ? { targetContainerName } : {}),
                    },
                  ],
                },
                status: {
                  ...currentPodData.status,
                  ephemeralContainerStatuses: [
                    ...(currentPodData.status.ephemeralContainerStatuses || []),
                    {
                      name: debugContainerName,
                      image: newEphemeral?.image || 'busybox',
                      imageID: '',
                      ready: false,
                      restartCount: 0,
                      state: { running: { startedAt: '2023-01-01T00:00:01Z' } },
                      lastState: {},
                    },
                  ],
                },
              };

              mockPodsDb.set(podName, updatedPod);
              return HttpResponse.json(updatedPod);
            }
          ),
          // Mock the GET request to poll pod status — returns pod with running debug container
          http.get(
            /\/api\/v1\/namespaces\/([^/]+)\/pods\/([^/]+)$/,
            ({ request }) => {
              const url = new URL(request.url);
              const parts = url.pathname.split('/');
              const podName = parts[parts.length - 1];
              const podData = mockPodsDb.get(podName);
              return HttpResponse.json(podData || mockPod.jsonData);
            }
          ),
        ],
      },
    },
  },
} as Meta<typeof PodDebugTerminal>;

const Template: StoryFn<typeof PodDebugTerminal> = args => {
  // Reset DB for the current story to ensure clean runs
  mockPodsDb.set(mockPod.metadata.name, JSON.parse(JSON.stringify(mockPod.jsonData)));
  mockPodsDb.set(
    multiContainerPod.metadata.name,
    JSON.parse(JSON.stringify(multiContainerPod.jsonData))
  );

  return (
    <Box sx={{ width: '100%', height: '400px' }}>
      <PodDebugTerminal {...args} />
    </Box>
  );
};

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
