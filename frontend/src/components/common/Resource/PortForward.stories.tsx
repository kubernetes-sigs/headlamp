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
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import Pod from '../../../lib/k8s/pod';
import { TestContext } from '../../../test';
import PortForward from './PortForward';

/**
 * Decorator that wraps each story in TestContext.
 * Electron env simulation is handled by the beforeEach hook in Meta.
 */
function withElectronEnv(Story: StoryFn) {
  return (
    <TestContext>
      <Story />
    </TestContext>
  );
}

const podJson = {
  apiVersion: 'v1',
  kind: 'Pod',
  metadata: {
    name: 'my-nginx-pod',
    namespace: 'default',
    uid: 'abc-123',
    creationTimestamp: '2025-01-01T00:00:00Z',
  },
  spec: {
    nodeName: 'worker-node-1',
    containers: [
      {
        name: 'nginx',
        image: 'nginx:latest',
        imagePullPolicy: 'Always',
        ports: [{ containerPort: 80, protocol: 'TCP' }],
      },
    ],
  },
  status: {
    phase: 'Running',
    conditions: [],
    containerStatuses: [],
    startTime: null,
  },
};

const mockPod = new Pod(podJson);
mockPod.cluster = 'minikube';

const mockPortForwardList = http.get('*/clusters/*/portforward/list', () => HttpResponse.json([]));

const mockPodsEndpoint = http.get('*/api/v1/namespaces/default/pods', () =>
  HttpResponse.json({
    kind: 'PodList',
    apiVersion: 'v1',
    metadata: {},
    items: [mockPod.jsonData],
  })
);

export default {
  title: 'Resource/PortForward',
  component: PortForward,
  decorators: [withElectronEnv],
  beforeEach: () => {
    // Simulate Electron environment so isElectron() returns true
    const hadProcess = 'process' in window;
    const originalProcess = (window as any).process;
    (window as any).process = { ...originalProcess, type: 'renderer' };

    // Clear portforwards from localStorage so prior stories don't affect this one
    localStorage.removeItem('portforwards');

    // Cleanup: restore window.process after the story is done
    return () => {
      if (hadProcess) {
        (window as any).process = originalProcess;
      } else {
        delete (window as any).process;
      }
    };
  },
} as Meta;

// Story 1: Port Forward Form (initial state)
const PortForwardFormTemplate: StoryFn = () => (
  <PortForward containerPort={80} resource={mockPod} />
);

export const PortForwardForm = PortForwardFormTemplate.bind({});
PortForwardForm.parameters = {
  msw: {
    handlers: {
      story: [mockPortForwardList, mockPodsEndpoint],
    },
  },
};

// Story 2: Connection Pending Loading State
const LoadingTemplate: StoryFn = () => <PortForward containerPort={80} resource={mockPod} />;

export const ConnectionPendingLoading = LoadingTemplate.bind({});
ConnectionPendingLoading.play = async ({ canvasElement }: any) => {
  const canvas = within(canvasElement);
  const user = userEvent.setup();
  const forwardBtn = await canvas.findByRole('button', { name: /Start port forward/i });
  await user.click(forwardBtn);

  const startBtn = await screen.findByRole('button', { name: /^Start$/i });
  await user.click(startBtn);
};
ConnectionPendingLoading.parameters = {
  storyshots: {
    disable: true,
  },
  msw: {
    handlers: {
      story: [
        mockPodsEndpoint,
        mockPortForwardList,
        // Make startPortForward hang to show loading state
        http.post('*/clusters/*/portforward', () => {
          return new Promise(() => {
            // Never resolves keeps the loading spinner visible
          });
        }),
      ],
    },
  },
};

// Story 3: Connection Established Success (Running state)
const ConnectionEstablishedTemplate: StoryFn = () => (
  <PortForward containerPort={80} resource={mockPod} />
);

export const ConnectionEstablishedSuccess = ConnectionEstablishedTemplate.bind({});
ConnectionEstablishedSuccess.parameters = {
  msw: {
    handlers: {
      story: [
        mockPodsEndpoint,
        http.get('*/clusters/*/portforward/list', () =>
          HttpResponse.json([
            {
              id: 'pf-123',
              pod: 'my-nginx-pod',
              service: '',
              serviceNamespace: '',
              namespace: 'default',
              cluster: 'minikube',
              port: '8080',
              targetPort: '80',
              status: 'Running',
            },
          ])
        ),
      ],
    },
  },
};

// Story 4: Connection Failed Error State
const ConnectionFailedTemplate: StoryFn = () => (
  <PortForward containerPort={80} resource={mockPod} />
);

export const ConnectionFailedError = ConnectionFailedTemplate.bind({});
ConnectionFailedError.play = async ({ canvasElement }: any) => {
  const canvas = within(canvasElement);
  const user = userEvent.setup();
  const forwardBtn = await canvas.findByRole('button', { name: /Start port forward/i });
  await user.click(forwardBtn);

  const startBtn = await screen.findByRole('button', { name: /^Start$/i });
  await user.click(startBtn);
};
ConnectionFailedError.parameters = {
  storyshots: {
    disable: true,
  },
  msw: {
    handlers: {
      story: [
        mockPodsEndpoint,
        mockPortForwardList,
        http.post('*/clusters/*/portforward', () =>
          HttpResponse.json(
            { message: 'Connection refused: unable to connect to pod my-nginx-pod on port 80' },
            { status: 500 }
          )
        ),
      ],
    },
  },
};

// Story 5: Port Already In Use Error
const PortInUseTemplate: StoryFn = () => <PortForward containerPort={80} resource={mockPod} />;

export const PortAlreadyInUseError = PortInUseTemplate.bind({});
PortAlreadyInUseError.play = async ({ canvasElement }: any) => {
  const canvas = within(canvasElement);
  const user = userEvent.setup();
  const forwardBtn = await canvas.findByRole('button', { name: /Start port forward/i });
  await user.click(forwardBtn);

  const startBtn = await screen.findByRole('button', { name: /^Start$/i });
  await user.click(startBtn);
};
PortAlreadyInUseError.parameters = {
  storyshots: {
    disable: true,
  },
  msw: {
    handlers: {
      story: [
        mockPodsEndpoint,
        mockPortForwardList,
        http.post('*/clusters/*/portforward', () =>
          HttpResponse.json(
            { message: 'Port 8080 is already in use. Please choose a different local port.' },
            { status: 500 }
          )
        ),
      ],
    },
  },
};
