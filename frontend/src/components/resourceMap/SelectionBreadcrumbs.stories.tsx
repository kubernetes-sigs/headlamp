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
import { KubeObject } from '../../lib/k8s/KubeObject';
import { TestContext } from '../../test';
import { GraphNode } from './graph/graphModel';
import { SelectionBreadcrumbs } from './SelectionBreadcrumbs';

const mockGraph: GraphNode = {
  id: 'root',
  nodes: [
    {
      id: 'workloads',
      label: 'Workloads',
      nodes: [
        { id: 'deploy-1', label: 'web-frontend', subtitle: 'Deployment' },
        { id: 'deploy-2', label: 'api-server', subtitle: 'Deployment' },
      ],
    },
    {
      id: 'ns-1',
      label: 'default',
      subtitle: 'Namespace',
      nodes: [{ id: 'pod-1', label: 'nginx-pod', subtitle: 'Pod' }],
    },
    {
      id: 'pod-with-obj',
      kubeObject: new KubeObject({
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
          uid: 'uid-my-pod',
          name: 'my-pod',
          namespace: 'default',
          creationTimestamp: '2024-02-15T00:00:00.000Z',
        },
      }),
    },
  ],
};

export default {
  title: 'ResourceMap/SelectionBreadcrumbs',
  component: SelectionBreadcrumbs,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta<typeof SelectionBreadcrumbs>;

const Template: StoryFn<typeof SelectionBreadcrumbs> = args => <SelectionBreadcrumbs {...args} />;

export const RootSelected = Template.bind({});
RootSelected.args = {
  graph: mockGraph,
  selectedNodeId: 'root',
  onNodeClick: () => {},
};

export const DirectChild = Template.bind({});
DirectChild.args = {
  graph: mockGraph,
  selectedNodeId: 'workloads',
  onNodeClick: () => {},
};

export const DeepNested = Template.bind({});
DeepNested.args = {
  graph: mockGraph,
  selectedNodeId: 'pod-1',
  onNodeClick: () => {},
};

export const WithKubeObject = Template.bind({});
WithKubeObject.args = {
  graph: mockGraph,
  selectedNodeId: 'pod-with-obj',
  onNodeClick: () => {},
};
