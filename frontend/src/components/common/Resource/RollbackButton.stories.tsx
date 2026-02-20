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
import { getTestDate } from '../../../helpers/testHelpers';
import DaemonSet from '../../../lib/k8s/daemonSet';
import Deployment from '../../../lib/k8s/deployment';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { TestContext } from '../../../test';
import { RollbackButton } from './RollbackButton';

export default {
  title: 'Resource/RollbackButton',
  component: RollbackButton,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof RollbackButton> = args => <RollbackButton {...args} />;

// Deployment example
const mockDeployment = new Deployment({
  metadata: {
    name: 'frontend-app',
    namespace: 'production',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid-deployment',
    annotations: {
      'deployment.kubernetes.io/revision': '5',
    },
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'frontend-app' },
    },
    template: {
      spec: {
        nodeName: 'worker-node-1',
        containers: [
          {
            name: 'frontend',
            image: 'myapp:v1.3.0',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    replicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
    updatedReplicas: 3,
  },
  kind: 'Deployment',
});

// DaemonSet example
const mockDaemonSet = new DaemonSet({
  metadata: {
    name: 'node-exporter',
    namespace: 'monitoring',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid-daemonset',
  },
  spec: {
    selector: {
      matchLabels: { app: 'node-exporter' },
    },
    updateStrategy: {
      type: 'RollingUpdate',
      rollingUpdate: {
        maxUnavailable: 1,
      },
    },
    template: {
      spec: {
        nodeName: 'worker-node-1',
        containers: [
          {
            name: 'node-exporter',
            image: 'prom/node-exporter:v1.5.0',
            ports: [{ containerPort: 9100 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    currentNumberScheduled: 3,
    desiredNumberScheduled: 3,
    numberReady: 3,
    observedGeneration: 4,
  },
  kind: 'DaemonSet',
});

// StatefulSet example
const mockStatefulSet = new StatefulSet({
  metadata: {
    name: 'database',
    namespace: 'production',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid-statefulset',
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'database' },
    },
    updateStrategy: {
      type: 'RollingUpdate',
      rollingUpdate: { partition: 0 },
    },
    template: {
      spec: {
        nodeName: 'worker-node-1',
        containers: [
          {
            name: 'postgres',
            image: 'postgres:15',
            ports: [{ containerPort: 5432 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    replicas: 3,
    readyReplicas: 3,
    observedGeneration: 3,
  },
  kind: 'StatefulSet',
});

/**
 * Default example showing a Deployment that can be rolled back.
 * The button shows the history icon and opens a confirmation dialog when clicked.
 */
export const DeploymentExample = Template.bind({});
DeploymentExample.args = {
  item: mockDeployment,
};

/**
 * Example showing a DaemonSet that can be rolled back.
 * DaemonSets use ControllerRevisions for revision history.
 */
export const DaemonSetExample = Template.bind({});
DaemonSetExample.args = {
  item: mockDaemonSet,
};

/**
 * Example showing a StatefulSet that can be rolled back.
 * StatefulSets also use ControllerRevisions for revision history.
 */
export const StatefulSetExample = Template.bind({});
StatefulSetExample.args = {
  item: mockStatefulSet,
};
