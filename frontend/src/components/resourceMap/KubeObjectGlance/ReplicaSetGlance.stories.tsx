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
import ReplicaSet, { KubeReplicaSet } from '../../../lib/k8s/replicaSet';
import { ReplicaSetGlance } from './ReplicaSetGlance';

export default {
  title: 'resourceMap/KubeObjectGlance/ReplicaSetGlance',
  component: ReplicaSetGlance,
} as Meta<typeof ReplicaSetGlance>;

const Template: StoryFn<typeof ReplicaSetGlance> = args => <ReplicaSetGlance {...args} />;

function createReplicaSet(readyReplicas: number, replicas: number): ReplicaSet {
  const json: KubeReplicaSet = {
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: 'my-replicaset',
      namespace: 'default',
      uid: 'replicaset-uid',
      creationTimestamp: new Date().toISOString(),
      resourceVersion: '1',
      selfLink: '',
    } as any,
    spec: {
      minReadySeconds: 0,
      replicas,
      selector: { matchLabels: { app: 'my-app' } },
      template: {
        spec: {
          containers: [{ name: 'app', image: 'nginx', imagePullPolicy: 'Always' }],
          nodeName: '',
        },
      },
    },
    status: {
      replicas,
      readyReplicas,
      availableReplicas: readyReplicas,
      fullyLabeledReplicas: replicas,
      observedGeneration: 1,
      conditions: [],
    },
  };
  return new ReplicaSet(json);
}

export const AllReplicasReady = Template.bind({});
AllReplicasReady.args = {
  set: createReplicaSet(3, 3),
};

export const PartiallyReady = Template.bind({});
PartiallyReady.args = {
  set: createReplicaSet(1, 3),
};

export const NoReplicasReady = Template.bind({});
NoReplicasReady.args = {
  set: createReplicaSet(0, 3),
};
