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
import Deployment from '../../lib/k8s/deployment';
import Pod from '../../lib/k8s/pod';
import { TestContext } from '../../test';
import { ProjectResourcesTab } from './ProjectResourcesTab';

export default {
  title: 'project/ProjectResourcesTab',
  component: ProjectResourcesTab,
  argTypes: {},
  decorators: [Story => <Story />],
} as Meta;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeDeployment(params: {
  name: string;
  namespace?: string;
  replicas?: number;
  readyReplicas?: number;
  cluster?: string;
}) {
  const {
    name,
    namespace = 'default',
    replicas = 3,
    readyReplicas = 3,
    cluster = 'local',
  } = params;

  return new Deployment(
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name,
        namespace,
        uid: uid(name),
        creationTimestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      spec: {
        replicas,
        template: { spec: { containers: [] as any, nodeName: '' } },
      } as any,
      status: {
        readyReplicas,
        availableReplicas: Math.min(readyReplicas, replicas),
      } as any,
    } as any,
    cluster
  );
}

function makePod(params: {
  name: string;
  namespace?: string;
  phase?: string;
  ready?: boolean;
  cluster?: string;
}) {
  const {
    name,
    namespace = 'default',
    phase = 'Running',
    ready = true,
    cluster = 'local',
  } = params;
  return new Pod(
    {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name,
        namespace,
        uid: uid(name),
        creationTimestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      spec: { containers: [] as any, nodeName: '' },
      status: {
        phase,
        conditions: [
          {
            type: 'Ready',
            status: ready ? 'True' : 'False',
          },
        ],
        containerStatuses: [],
        startTime: new Date().toISOString() as any,
      },
    } as any,
    cluster
  );
}

const Template: StoryFn<{ projectResources: any[] }> = args => {
  const { projectResources } = args;
  return (
    <TestContext>
      <div style={{ height: 500 }}>
        <ProjectResourcesTab
          projectResources={projectResources as any}
          setSelectedCategoryName={() => {}}
        />
      </div>
    </TestContext>
  );
};

export const Empty: any = Template.bind({});
Empty.args = {
  projectResources: [],
};

export const WithWorkloads: any = Template.bind({});
WithWorkloads.args = {
  projectResources: [
    makeDeployment({ name: 'cart', replicas: 3, readyReplicas: 3 }),
    makeDeployment({ name: 'checkout', replicas: 3, readyReplicas: 1 }),
    makeDeployment({ name: 'payments', replicas: 2, readyReplicas: 0 }),
    makePod({ name: 'cart-abc123', phase: 'Running', ready: true }),
    makePod({ name: 'checkout-def456', phase: 'Pending', ready: false }),
    makePod({ name: 'payments-ghi789', phase: 'Failed', ready: false }),
  ],
};
