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
import Deployment from '../../../lib/k8s/deployment';
import ReplicaSet from '../../../lib/k8s/replicaSet';
import StatefulSet from '../../../lib/k8s/statefulSet';
import { TestContext } from '../../../test';
import ScaleButton from './ScaleButton';

export default {
  title: 'Resource/ScaleButton',
  component: ScaleButton,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof ScaleButton> = args => <ScaleButton {...args} />;

const mockDeployment = new Deployment({
  metadata: {
    name: 'mock-deployment',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid',
  },
  spec: {
    replicas: 3,
    template: {
      spec: {
        nodeName: 'mock-node',
        containers: [
          {
            name: 'mock-container',
            image: 'mock-image',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {},
  kind: 'Deployment',
});

const mockStatefulSet = new StatefulSet({
  metadata: {
    name: 'mock-statefulset',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid',
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: { app: 'headlamp' },
    },
    updateStrategy: {
      rollingUpdate: { partition: 1 },
      type: 'RollingUpdate',
    },
    template: {
      spec: {
        nodeName: 'mock-node',
        containers: [
          {
            name: 'mock-container',
            image: 'mock-image',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
    status: {},
  },
  status: {},
  kind: 'StatefulSet',
});

const mockReplicaSet = new ReplicaSet({
  metadata: {
    name: 'mock-statefulset',
    namespace: 'default',
    creationTimestamp: getTestDate().toDateString(),
    uid: 'mock-uid',
  },
  spec: {
    minReadySeconds: 0,
    replicas: 3,
    selector: {
      matchLabels: { app: 'headlamp' },
    },
    template: {
      spec: {
        nodeName: 'mock-node',
        containers: [
          {
            name: 'mock-container',
            image: 'mock-image',
            ports: [{ containerPort: 80 }],
            imagePullPolicy: 'Always',
          },
        ],
      },
    },
  },
  status: {
    availableReplicas: 3,
    conditions: [],
    fullyLabeledReplicas: 3,
    observedGeneration: 3,
    readyReplicas: 2,
    replicas: 3,
  },
  kind: 'ReplicaSet',
});

export const DeploymentExample = Template.bind({});
DeploymentExample.args = {
  item: mockDeployment,
};

export const StatefulSetExample = Template.bind({});
StatefulSetExample.args = {
  item: mockStatefulSet,
};

export const ReplicaSetExample = Template.bind({});
ReplicaSetExample.args = {
  item: mockReplicaSet,
};
