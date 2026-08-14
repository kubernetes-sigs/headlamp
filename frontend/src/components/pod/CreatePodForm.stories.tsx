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
import { expect, waitFor, within } from 'storybook/test';
import { TestContext } from '../../test';
import CreatePodForm, { CreatePodFormProps } from './CreatePodForm';

export default {
  title: 'pod/CreatePodForm',
  component: CreatePodForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreatePodFormProps> = args => <CreatePodForm {...args} />;

/**
 * Empty form — all fields start blank. Verifies that the Name field
 * and Add container button are present and accessible.
 */
export const Empty = Template.bind({});
Empty.args = {
  resource: {},
};
Empty.parameters = {
  storyshots: { disable: true },
};
Empty.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => {
    expect(canvas.getByLabelText('Name')).toBeInTheDocument();
    expect(canvas.getByRole('button', { name: /Add container/i })).toBeInTheDocument();
  });
};

/**
 * Pre-filled form — metadata, one container, and an empty nodeName are
 * pre-populated. Verifies that the Name, Container name, Container image,
 * and Image pull policy fields are rendered with the correct values.
 */
export const Prefilled = Template.bind({});
Prefilled.args = {
  resource: {
    metadata: {
      name: 'my-nginx',
      namespace: 'default',
      labels: { app: 'nginx', tier: 'frontend' },
    },
    spec: {
      containers: [
        {
          name: 'nginx',
          image: 'nginx:1.27',
          ports: [{ containerPort: 80 }],
          imagePullPolicy: 'IfNotPresent',
        },
      ],
      nodeName: '',
    },
  },
};
Prefilled.parameters = {
  storyshots: { disable: true },
};
Prefilled.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => {
    expect(canvas.getByLabelText('Name')).toHaveValue('my-nginx');
    expect(canvas.getByLabelText('Container name')).toHaveValue('nginx');
    expect(canvas.getByLabelText('Container image')).toHaveValue('nginx:1.27');
    expect(canvas.getByLabelText('Image pull policy')).toBeInTheDocument();
  });
};

/**
 * Two containers — an app container and a sidecar. Verifies that both
 * Container name and Container image labels appear twice (one per container).
 */
export const MultipleContainers = Template.bind({});
MultipleContainers.args = {
  resource: {
    metadata: { name: 'sidecar-pod', namespace: 'apps' },
    spec: {
      containers: [
        {
          name: 'app',
          image: 'myapp:latest',
          ports: [{ containerPort: 8080 }],
          imagePullPolicy: 'Always',
        },
        {
          name: 'sidecar',
          image: 'envoyproxy/envoy:v1.30',
          ports: [{ containerPort: 9901 }],
          imagePullPolicy: 'IfNotPresent',
        },
      ],
    },
  },
};
MultipleContainers.parameters = {
  storyshots: { disable: true },
};
MultipleContainers.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => {
    const containerNames = canvas.getAllByLabelText('Container name');
    expect(containerNames).toHaveLength(2);
    expect(containerNames[0]).toHaveValue('app');
    expect(containerNames[1]).toHaveValue('sidecar');
    const containerImages = canvas.getAllByLabelText('Container image');
    expect(containerImages).toHaveLength(2);
  });
};

/**
 * Pod pinned to a specific node via nodeName. Verifies that the Name field
 * and the Node Name field both carry the correct pre-filled values.
 */
export const WithNodeName = Template.bind({});
WithNodeName.args = {
  resource: {
    metadata: { name: 'pinned-pod' },
    spec: {
      containers: [
        {
          name: 'worker',
          image: 'busybox:latest',
          ports: [{ containerPort: 8080 }],
          imagePullPolicy: 'Never',
        },
      ],
      nodeName: 'node-01',
    },
  },
};
WithNodeName.parameters = {
  storyshots: { disable: true },
};
WithNodeName.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => {
    expect(canvas.getByLabelText('Name')).toHaveValue('pinned-pod');
    expect(canvas.getByLabelText('Node Name')).toHaveValue('node-01');
  });
};
