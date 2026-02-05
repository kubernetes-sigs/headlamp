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
import { RolloutUndoButton } from './RolloutUndoButton';

export default {
  title: 'Resource/RolloutUndoButton',
  component: RolloutUndoButton,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof RolloutUndoButton> = args => <RolloutUndoButton {...args} />;

const mockDeployment = new Deployment({
  metadata: {
    name: 'nginx-deployment',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'deployment-uid-123',
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'nginx' },
    },
    template: {
      metadata: {
        labels: { app: 'nginx' },
      },
      spec: {
        nodeName: 'node-1',
        containers: [
          {
            name: 'nginx',
            image: 'nginx:1.19',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    replicas: 3,
    updatedReplicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
  },
  kind: 'Deployment',
});

const mockDaemonSet = new DaemonSet({
  metadata: {
    name: 'fluentd-daemonset',
    namespace: 'kube-system',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'daemonset-uid-456',
  },
  spec: {
    selector: {
      matchLabels: { app: 'fluentd' },
    },
    updateStrategy: {
      type: 'RollingUpdate',
      rollingUpdate: { maxUnavailable: 1 },
    },
    template: {
      metadata: {
        labels: { app: 'fluentd' },
      },
      spec: {
        nodeName: 'node-1',
        containers: [
          {
            name: 'fluentd',
            image: 'fluentd:v1.14',
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    currentNumberScheduled: 3,
    numberMisscheduled: 0,
    desiredNumberScheduled: 3,
    numberReady: 3,
    observedGeneration: 1,
    updatedNumberScheduled: 3,
    numberAvailable: 3,
  },
  kind: 'DaemonSet',
});

const mockStatefulSet = new StatefulSet({
  metadata: {
    name: 'mysql-statefulset',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'statefulset-uid-789',
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'mysql' },
    },
    updateStrategy: {
      type: 'RollingUpdate',
      rollingUpdate: { partition: 0 },
    },
    template: {
      metadata: {
        labels: { app: 'mysql' },
      },
      spec: {
        nodeName: 'node-1',
        containers: [
          {
            name: 'mysql',
            image: 'mysql:8.0',
            ports: [{ containerPort: 3306 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    replicas: 3,
    readyReplicas: 3,
    currentReplicas: 3,
    updatedReplicas: 3,
    currentRevision: 'mysql-statefulset-5d9c8b7f9c',
    updateRevision: 'mysql-statefulset-5d9c8b7f9c',
    observedGeneration: 1,
    collisionCount: 0,
    availableReplicas: 3,
  },
  kind: 'StatefulSet',
});

export const DeploymentExample = Template.bind({});
DeploymentExample.args = {
  item: mockDeployment,
};

export const DaemonSetExample = Template.bind({});
DaemonSetExample.args = {
  item: mockDaemonSet,
};

export const StatefulSetExample = Template.bind({});
StatefulSetExample.args = {
  item: mockStatefulSet,
};
