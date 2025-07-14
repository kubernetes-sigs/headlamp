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

import type { Meta, StoryFn } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import { TestContext } from '../../test';
import { PodLogViewer } from './Details';
import Pod from '../../lib/k8s/pod';

const meta: Meta<typeof PodLogViewer> = {
  title: 'Pod/PodLogViewer',
  component: PodLogViewer,
  decorators: [
    (Story) => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: 'Enhanced Pod Log Viewer with previous logs support for crashed containers',
      },
    },
  },
};

export default meta;

// Mock pod with normal container
const normalPod = {
  metadata: {
    name: 'normal-pod',
    namespace: 'default',
    uid: 'normal-uid',
  },
  spec: {
    containers: [
      { name: 'web-server' },
      { name: 'sidecar' },
    ],
  },
  status: {
    containerStatuses: [
      {
        name: 'web-server',
        restartCount: 0,
        state: { running: { startedAt: '2025-01-01T00:00:00Z' } },
      },
      {
        name: 'sidecar',
        restartCount: 0,
        state: { running: { startedAt: '2025-01-01T00:00:00Z' } },
      },
    ],
  },
  getName: () => 'normal-pod',
  getNamespace: () => 'default',
  getLogs: () => () => {},
} as unknown as Pod;

// Mock pod with restarted container
const restartedPod = {
  metadata: {
    name: 'restarted-pod',
    namespace: 'default',
    uid: 'restarted-uid',
  },
  spec: {
    containers: [
      { name: 'app-container' },
      { name: 'monitoring' },
    ],
  },
  status: {
    containerStatuses: [
      {
        name: 'app-container',
        restartCount: 2,
        state: { running: { startedAt: '2025-01-01T00:00:00Z' } },
        lastState: { terminated: { reason: 'Completed', exitCode: 0 } },
      },
      {
        name: 'monitoring',
        restartCount: 0,
        state: { running: { startedAt: '2025-01-01T00:00:00Z' } },
      },
    ],
  },
  getName: () => 'restarted-pod',
  getNamespace: () => 'default',
  getLogs: () => () => {},
} as unknown as Pod;

// Mock pod with crashed container
const crashedPod = {
  metadata: {
    name: 'crashed-pod',
    namespace: 'production',
    uid: 'crashed-uid',
  },
  spec: {
    containers: [
      { name: 'main-app' },
      { name: 'crashed-service' },
    ],
  },
  status: {
    containerStatuses: [
      {
        name: 'main-app',
        restartCount: 0,
        state: { running: { startedAt: '2025-01-01T00:00:00Z' } },
      },
      {
        name: 'crashed-service',
        restartCount: 5,
        state: { waiting: { reason: 'CrashLoopBackOff' } },
        lastState: { terminated: { reason: 'Error', exitCode: 1 } },
      },
    ],
  },
  getName: () => 'crashed-pod',
  getNamespace: () => 'production',
  getLogs: () => () => {},
} as unknown as Pod;

const Template: StoryFn<typeof PodLogViewer> = (args) => <PodLogViewer {...args} />;

export const NormalPod = Template.bind({});
NormalPod.args = {
  open: true,
  item: normalPod,
  onClose: action('onClose'),
};
NormalPod.parameters = {
  docs: {
    description: {
      story: 'Pod with normal containers - previous logs option is disabled for containers without restarts.',
    },
  },
};

export const RestartedPod = Template.bind({});
RestartedPod.args = {
  open: true,
  item: restartedPod,
  onClose: action('onClose'),
};
RestartedPod.parameters = {
  docs: {
    description: {
      story: 'Pod with restarted containers - previous logs option is available for containers that have restarted.',
    },
  },
};

export const CrashedPod = Template.bind({});
CrashedPod.args = {
  open: true,
  item: crashedPod,
  onClose: action('onClose'),
};
CrashedPod.parameters = {
  docs: {
    description: {
      story: 'Pod with crashed containers - previous logs option is highlighted with error styling and crash indicators.',
    },
  },
};

export const CrashedPodWithPreviousLogsEnabled = Template.bind({});
CrashedPodWithPreviousLogsEnabled.args = {
  open: true,
  item: crashedPod,
  onClose: action('onClose'),
  showPreviousDefault: true,
};
CrashedPodWithPreviousLogsEnabled.parameters = {
  docs: {
    description: {
      story: 'Pod with crashed containers and previous logs enabled by default - useful when opening logs directly for debugging crashed containers.',
    },
  },
};

export const RestartedPodWithPreviousLogsEnabled = Template.bind({});
RestartedPodWithPreviousLogsEnabled.args = {
  open: true,
  item: restartedPod,
  onClose: action('onClose'),
  showPreviousDefault: true,
};
RestartedPodWithPreviousLogsEnabled.parameters = {
  docs: {
    description: {
      story: 'Pod with restarted containers and previous logs enabled by default - shows warning styling for previous logs viewing.',
    },
  },
};
