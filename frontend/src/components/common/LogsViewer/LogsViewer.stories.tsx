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
import { http, HttpResponse } from 'msw';
import Pod from '../../../lib/k8s/pod';
import { TestContext } from '../../../test';
import { LogsViewer } from './LogsViewer';

const cluster = 'test-cluster';
const namespace = 'default';

const makePod = (name: string, containers: { name: string; image: string }[]) =>
  new Pod(
    {
      kind: 'Pod',
      apiVersion: 'v1',
      metadata: {
        name,
        namespace,
        creationTimestamp: '2024-01-01T00:00:00Z',
        uid: `uid-${name}`,
        resourceVersion: '1',
      },
      status: {
        phase: 'Running',
        conditions: [],
        containerStatuses: containers.map(c => ({
          name: c.name,
          image: c.image,
          imageID: '',
          containerID: '',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: '2024-01-01T00:00:00Z' } },
          lastState: {},
        })),
        startTime: '2024-01-01T00:00:00Z',
        hostIP: '10.0.0.1',
        podIP: '10.0.0.2',
      },
      spec: {
        containers: containers.map(c => ({
          name: c.name,
          image: c.image,
          imagePullPolicy: 'IfNotPresent',
        })),
        nodeName: 'mock-node',
        restartPolicy: 'Always',
        serviceAccountName: 'default',
        serviceAccount: 'default',
        tolerations: [],
      },
    },
    cluster
  );

/** Build a streaming text/plain response from an array of log lines. */
const streamResponse = (lines: string[]) => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('\n') + '\n'));
      controller.close();
    },
  });
  return new HttpResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};

const sampleLines = [
  '2024-01-01T12:00:00.001Z INFO Starting application server on port 8080',
  '2024-01-01T12:00:00.250Z INFO Connected to database in 240ms',
  '2024-01-01T12:00:01.000Z DEBUG Loaded configuration from /etc/app/config.yaml',
  '2024-01-01T12:00:02.000Z WARN Cache miss for key user:42, falling back to origin',
  '2024-01-01T12:00:03.000Z ERROR Failed to acquire lease: context deadline exceeded',
  '2024-01-01T12:00:04.000Z INFO GET /healthz 200 in 3ms',
  '2024-01-01T12:00:05.000Z INFO GET /api/v1/items 200 in 12ms',
  '2024-01-01T12:00:06.000Z WARN Slow query: 1340ms SELECT * FROM events',
  '2024-01-01T12:00:07.000Z INFO POST /api/v1/items 201 in 22ms',
  '2024-01-01T12:00:08.000Z FATAL Unrecoverable error, shutting down',
];

const colorfulLines = [
  '2024-01-01T12:00:00.001Z \u001b[32mINFO\u001b[0m server started',
  '2024-01-01T12:00:01.000Z \u001b[33mWARN\u001b[0m disk usage at 85%',
  '2024-01-01T12:00:02.000Z \u001b[1;31mERROR\u001b[0m failed to write to /var/log/app.log',
  '2024-01-01T12:00:03.000Z \u001b[36mDEBUG\u001b[0m gc pause 1.2ms',
];

export default {
  title: 'common/LogsViewer/LogsViewer',
  component: LogsViewer,
  decorators: [
    Story => (
      <TestContext>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '70vh',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Story />
        </Box>
      </TestContext>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
} as Meta<typeof LogsViewer>;

const Template: StoryFn<React.ComponentProps<typeof LogsViewer>> = args => <LogsViewer {...args} />;

/** Single container pod with a small set of streamed log lines. */
export const SinglePod = Template.bind({});
SinglePod.args = {
  item: makePod('mock-pod', [{ name: 'app', image: 'app:latest' }]),
};
SinglePod.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('*/api/v1/namespaces/:namespace/pods/:pod/log', () => streamResponse(sampleLines)),
      ],
    },
  },
};

/** Pod with multiple containers, the toolbar exposes a container picker. */
export const MultipleContainers = Template.bind({});
MultipleContainers.args = {
  item: makePod('multi-pod', [
    { name: 'app', image: 'app:latest' },
    { name: 'sidecar', image: 'sidecar:latest' },
  ]),
};
MultipleContainers.parameters = SinglePod.parameters;

/** Default severity filter applied via prop, only matching entries are shown. */
export const WithDefaultSeverityFilter = Template.bind({});
WithDefaultSeverityFilter.args = {
  item: makePod('filtered-pod', [{ name: 'app', image: 'app:latest' }]),
  defaultSeverities: ['error', 'warning', 'fatal'],
};
WithDefaultSeverityFilter.parameters = SinglePod.parameters;

/** Logs containing ANSI escape codes are rendered with color. */
export const ColorfulLogs = Template.bind({});
ColorfulLogs.args = {
  item: makePod('colorful-pod', [{ name: 'app', image: 'app:latest' }]),
};
ColorfulLogs.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('*/api/v1/namespaces/:namespace/pods/:pod/log', () =>
          streamResponse(colorfulLines)
        ),
      ],
    },
  },
};

/** Backend responds with an error, the viewer shows a cluster error message. */
export const LogsError = Template.bind({});
LogsError.args = {
  item: makePod('error-pod', [{ name: 'app', image: 'app:latest' }]),
};
LogsError.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('*/api/v1/namespaces/:namespace/pods/:pod/log', () =>
          HttpResponse.json(
            {
              kind: 'Status',
              apiVersion: 'v1',
              status: 'Failure',
              message: 'container "app" in pod "error-pod" is waiting to start: ContainerCreating',
              reason: 'BadRequest',
              code: 400,
            },
            { status: 400 }
          )
        ),
      ],
    },
  },
};

/** Backend returns no log lines, the viewer shows an empty area. */
export const EmptyLogs = Template.bind({});
EmptyLogs.args = {
  item: makePod('empty-pod', [{ name: 'app', image: 'app:latest' }]),
};
EmptyLogs.parameters = {
  msw: {
    handlers: {
      story: [http.get('*/api/v1/namespaces/:namespace/pods/:pod/log', () => streamResponse([]))],
    },
  },
};
