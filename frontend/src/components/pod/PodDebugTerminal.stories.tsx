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
          'http://localhost:4466/clusters/default/api/v1/namespaces/default/pods/mock-pod/ephemeralcontainers',
          async () => {
            // We won't really create an ephemeral container, so always return empty arrays
            return HttpResponse.json({
              ...mockPod.jsonData,
              spec: {
                ...mockPod.jsonData.spec,
                ephemeralContainers: [],
              },
              status: {
                ...mockPod.jsonData.status,
                ephemeralContainerStatuses: [],
              },
            });
          }
        ),
        // Mock the GET request to poll pod status
        http.get(
          'http://localhost:4466/clusters/default/api/v1/namespaces/default/pods/mock-pod',
          () => {
            return HttpResponse.json(mockPod.jsonData);
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
