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
import { http, HttpResponse } from 'msw';
import React, { useEffect } from 'react';
import { userEvent, waitFor } from 'storybook/test';
import Deployment from '../../../lib/k8s/deployment';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import Pod from '../../../lib/k8s/pod';
import { TestContext } from '../../../test';
import { ActivitiesRenderer } from '../../activity/Activity';
import { LogsButton } from './LogsButton';

export default {
  title: 'common/Resource/LogsButton',
  component: LogsButton,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Box
          sx={{
            display: 'grid',
            overflow: 'hidden',
            position: 'relative',
            gridTemplateRows: '1fr min-content',
            gridTemplateColumns: 'min-content 1fr',
            width: '100%',
            height: '90vh',
          }}
        >
          <Box
            id="main"
            sx={{
              overflow: 'auto',
              position: 'relative',
              minHeight: '0',
              gridColumn: '2/3',
              gridRow: '1/2',
              padding: 2,
            }}
          >
            <Story />
          </Box>
          <ActivitiesRenderer />
        </Box>
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<{ item: KubeObject | null }> = args => <LogsButton {...args} />;

// --- Mock Data ---

const mockNamespace = 'default';
const mockContainerName = 'nginx';

const mockDeployment = new Deployment({
  kind: 'Deployment',
  metadata: {
    name: 'test-deployment',
    namespace: mockNamespace,
    creationTimestamp: '2024-01-01T00:00:00Z',
    uid: 'dep-123',
  },
  spec: {
    selector: {
      matchLabels: {
        app: 'test-app',
      },
    },
    template: {
      spec: {
        nodeName: 'mock-node',
        containers: [
          {
            name: mockContainerName,
            image: 'nginx:latest',
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {},
});

const mockPodJSON = {
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'test-pod-1',
    namespace: mockNamespace,
    uid: 'pod-123',
    creationTimestamp: '2024-01-01T00:00:00Z',
  },
  spec: {
    containers: [
      {
        name: mockContainerName,
        image: 'nginx:latest',
        imagePullPolicy: 'Always',
      },
    ],
    nodeName: 'docker-desktop',
  },
  status: {
    phase: 'Running',
  },
};

const standardHandlers = [
  http.get('*/api/v1/namespaces/:namespace/pods', () => {
    return HttpResponse.json({
      kind: 'PodList',
      apiVersion: 'v1',
      metadata: {},
      items: [mockPodJSON],
    });
  }),
];

// --- Stories ---

/**
 * Button enabled state — the logs button is rendered and clickable
 * for a Deployment that has running pods available.
 */
export const Enabled = Template.bind({});
Enabled.args = {
  item: mockDeployment,
};
Enabled.parameters = {
  msw: {
    handlers: standardHandlers,
  },
};

/**
 * Button disabled state — no pods are available for this workload.
 * The API returns an empty pod list, so clicking would show no logs.
 */
export const NoLogsAvailable = Template.bind({});
NoLogsAvailable.args = {
  item: mockDeployment,
};
NoLogsAvailable.parameters = {
  msw: {
    handlers: [
      http.get('*/api/v1/namespaces/:namespace/pods', () => {
        return HttpResponse.json({
          kind: 'PodList',
          apiVersion: 'v1',
          metadata: {},
          items: [],
        });
      }),
    ],
  },
};

/**
 * Loading logs spinner state — pods exist but getLogs never delivers data,
 * simulating an indefinite loading state in the log viewer.
 */
export const LoadingLogs = Template.bind({});
LoadingLogs.args = {
  item: mockDeployment,
};
LoadingLogs.parameters = {
  msw: {
    handlers: standardHandlers,
  },
  storyshots: {
    disable: true,
  },
};
LoadingLogs.decorators = [
  (Story: StoryFn) => {
    useEffect(() => {
      const originalGetLogs = Pod.prototype.getLogs;
      Pod.prototype.getLogs = function () {
        // Never deliver logs — simulates loading
        return () => {};
      };
      return () => {
        Pod.prototype.getLogs = originalGetLogs;
      };
    }, []);
    return <Story />;
  },
];
LoadingLogs.play = async () => {
  await userEvent.click(screen.getByLabelText('Show logs'));
  await waitFor(() => screen.getByText(/Select Pod/i), { timeout: 5000 });
};

/**
 * Logs viewer opened state — pods are available and getLogs streams
 * sample log lines, simulating a fully loaded log viewer.
 */
export const LogsViewerOpened = Template.bind({});
LogsViewerOpened.args = {
  item: mockDeployment,
};
LogsViewerOpened.parameters = {
  msw: {
    handlers: standardHandlers,
  },
  storyshots: {
    disable: true,
  },
};
LogsViewerOpened.decorators = [
  (Story: StoryFn) => {
    useEffect(() => {
      const originalGetLogs = Pod.prototype.getLogs;
      Pod.prototype.getLogs = function (...args: any[]) {
        const onLogs = args[1];
        const mockLogs = [
          `2023-01-01T00:00:01Z Starting container...\n`,
          `2023-01-01T00:00:02Z Initializing application...\n`,
          `2023-01-01T00:00:03Z Server listening on port 80\n`,
        ];
        const timeout = setTimeout(() => {
          onLogs({ logs: mockLogs, hasJsonLogs: false });
        }, 100);
        return () => clearTimeout(timeout);
      };
      return () => {
        Pod.prototype.getLogs = originalGetLogs;
      };
    }, []);
    return <Story />;
  },
];
LogsViewerOpened.play = async () => {
  await userEvent.click(screen.getByLabelText('Show logs'));
  await waitFor(() => screen.getByText(/Select Pod/i), { timeout: 5000 });
};
