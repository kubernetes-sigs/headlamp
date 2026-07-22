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

import { Box } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import React from 'react';
import { userEvent } from 'storybook/test';
import Pod from '../../../lib/k8s/pod';
import { TestContext } from '../../../test';
import PortForward, { PortForwardState } from './PortForward';

export default {
  title: 'common/Resource/PortForward',
  component: PortForward,
  argTypes: {},
  decorators: [
    function PortForwardStoryDecorator(Story: any) {
      // Mock isElectron environment synchronously before first render
      const originalProcess = typeof window !== 'undefined' ? (window as any).process : undefined;

      if (typeof window !== 'undefined') {
        (window as any).process = { ...((window as any).process || {}), type: 'renderer' };
      }

      // Reset localStorage for portforwards between stories
      localStorage.removeItem('portforwards');

      React.useEffect(() => {
        return () => {
          localStorage.removeItem('portforwards');
          if (typeof window !== 'undefined') {
            (window as any).process = originalProcess;
          }
        };
      }, [originalProcess]);

      return (
        <TestContext>
          <Box
            sx={{
              padding: 4,
              maxWidth: 400, // Constrain width to see layout better
            }}
          >
            <Story />
          </Box>
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn<any> = args => <PortForward {...args} />;

// --- Mock Data ---

const mockNamespace = 'default';
const mockPodName = 'test-pod-1';
const mockCluster = 'minikube';
const mockContainerPort = 8080;

const mockPod = new Pod({
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: mockPodName,
    namespace: mockNamespace,
    uid: 'pod-123',
    creationTimestamp: '2024-01-01T00:00:00Z',
  },
  spec: {
    containers: [
      {
        name: 'nginx',
        image: 'nginx:latest',
        imagePullPolicy: 'Always',
        ports: [
          {
            containerPort: mockContainerPort,
          },
        ],
      },
    ],
    nodeName: 'docker-desktop',
  },
  status: {
    phase: 'Running',
  },
} as any);

mockPod.cluster = mockCluster;

// A port forward state that would be returned by the list API or start API
const activePortForward: PortForwardState = {
  id: 'pf-123',
  namespace: mockNamespace,
  pod: mockPodName,
  service: '',
  serviceNamespace: mockNamespace,
  cluster: mockCluster,
  targetPort: mockContainerPort.toString(),
  port: '30080',
  status: 'Running',
};

// Handlers for a typical successful flow
const standardHandlers = [
  // Mock listing active port forwards
  http.get('*/portforward/list', () => {
    return HttpResponse.json([]);
  }),
  // Mock listing pods
  http.get('*/api/v1/namespaces/:namespace/pods', () => {
    return HttpResponse.json({
      kind: 'PodList',
      apiVersion: 'v1',
      metadata: {},
      items: [mockPod.jsonData],
    });
  }),
];

// --- Stories ---

/**
 * Default port forward form view.
 */
export const DefaultForm = Template.bind({});
DefaultForm.args = {
  resource: mockPod,
  containerPort: mockContainerPort,
};
DefaultForm.parameters = {
  msw: {
    handlers: standardHandlers,
  },
};
DefaultForm.play = async () => {
  await userEvent.click(await screen.findByText(/Forward port/i));
};

/**
 * Connection pending (loading state).
 * The start API is mocked to delay its response indefinitely to show the spinner.
 */
export const ConnectionPending = Template.bind({});
ConnectionPending.args = {
  resource: mockPod,
  containerPort: mockContainerPort,
};
ConnectionPending.parameters = {
  msw: {
    handlers: [
      ...standardHandlers,
      http.post('*/portforward', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    ],
  },
  storyshots: {
    disable: true,
  },
};
ConnectionPending.play = async () => {
  await userEvent.click(await screen.findByText(/Forward port/i));
  const startButton = await screen.findByRole('button', { name: /Start/i });
  await userEvent.click(startButton);
};

/**
 * Connection established (success state).
 * The list API immediately returns an active port forward matching this pod.
 */
export const ConnectionEstablished = Template.bind({});
ConnectionEstablished.args = {
  resource: mockPod,
  containerPort: mockContainerPort,
};
ConnectionEstablished.parameters = {
  msw: {
    handlers: [
      http.get('*/portforward/list', () => {
        return HttpResponse.json([activePortForward]);
      }),
      ...standardHandlers,
    ],
  },
};
ConnectionEstablished.play = async () => {
  await screen.findByRole('button', { name: /Stop forwarding/i });
};

/**
 * Connection failed (generic error).
 * The start API is mocked to return a 500 error.
 */
export const ConnectionFailed = Template.bind({});
ConnectionFailed.args = {
  resource: mockPod,
  containerPort: mockContainerPort,
};
ConnectionFailed.parameters = {
  msw: {
    handlers: [
      ...standardHandlers,
      http.post('*/portforward', () => {
        return new HttpResponse('Internal Server Error', { status: 500 });
      }),
    ],
  },
};
ConnectionFailed.play = async () => {
  await userEvent.click(await screen.findByText(/Forward port/i));
  const startButton = await screen.findByRole('button', { name: /Start/i });
  await userEvent.click(startButton);
  // Wait for error banner
  await screen.findByText(/Internal Server Error/i);
};

/**
 * Port already in use (specific error).
 * The start API is mocked to return a 400 with "address already in use".
 */
export const PortAlreadyInUse = Template.bind({});
PortAlreadyInUse.args = {
  resource: mockPod,
  containerPort: mockContainerPort,
};
PortAlreadyInUse.parameters = {
  msw: {
    handlers: [
      ...standardHandlers,
      http.post('*/portforward', () => {
        return new HttpResponse('address already in use', { status: 400 });
      }),
    ],
  },
};
PortAlreadyInUse.play = async () => {
  await userEvent.click(await screen.findByText(/Forward port/i));
  const startButton = await screen.findByRole('button', { name: /Start/i });
  await userEvent.click(startButton);
  await screen.findByText(/address already in use/i);
};
