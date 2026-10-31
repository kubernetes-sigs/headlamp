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
import { ContainerState, KubeContainerStatus } from '../../../lib/k8s/cluster';
import Pod, { KubePod } from '../../../lib/k8s/pod';
import { PodGlance } from './PodGlance';

export default {
  title: 'resourceMap/KubeObjectGlance/PodGlance',
  component: PodGlance,
} as Meta<typeof PodGlance>;

const Template: StoryFn<typeof PodGlance> = args => <PodGlance {...args} />;

function createPod(phase: string, containerState: Partial<ContainerState>, restartCount = 0): Pod {
  const containerStatus: KubeContainerStatus = {
    name: 'app',
    image: 'nginx:1.25',
    imageID: 'docker-pullable://nginx@sha256:abcdef',
    ready: !!containerState.running,
    restartCount,
    state: containerState,
    lastState: {},
  };

  const json: KubePod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'my-pod',
      namespace: 'default',
      uid: 'pod-uid',
      creationTimestamp: new Date().toISOString(),
      resourceVersion: '1',
      selfLink: '',
    } as any,
    spec: {
      containers: [{ name: 'app', image: 'nginx:1.25', imagePullPolicy: 'Always' }],
      nodeName: 'node-1',
    },
    status: {
      conditions: [],
      containerStatuses: [containerStatus],
      phase,
      startTime: new Date().toISOString(),
      podIP: '10.244.0.12',
    },
  };
  return new Pod(json);
}

export const Running = Template.bind({});
Running.args = {
  pod: createPod('Running', { running: { startedAt: new Date().toISOString() } }),
};

export const Pending = Template.bind({});
Pending.args = {
  pod: createPod('Pending', { waiting: { reason: 'ContainerCreating' } as any }),
};

export const CrashLoopBackOff = Template.bind({});
CrashLoopBackOff.args = {
  pod: createPod(
    'Running',
    {
      waiting: {
        reason: 'CrashLoopBackOff',
        message: 'back-off 5m0s restarting failed container',
      } as any,
    },
    5
  ),
};

export const Succeeded = Template.bind({});
Succeeded.args = {
  pod: createPod('Succeeded', {
    terminated: {
      containerID: 'containerd://abcdef',
      exitCode: 0,
      finishedAt: new Date().toISOString(),
      reason: 'Completed',
      startedAt: new Date().toISOString(),
    },
  }),
};
