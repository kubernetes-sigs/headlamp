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
import { TestContext } from '../../test';
import CreateDeploymentForm, { CreateDeploymentFormProps } from './CreateDeploymentForm';

export default {
  title: 'deployment/CreateDeploymentForm',
  component: CreateDeploymentForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreateDeploymentFormProps> = args => <CreateDeploymentForm {...args} />;

export const Empty = Template.bind({});
Empty.args = {
  resource: {},
};

export const Prefilled = Template.bind({});
Prefilled.args = {
  resource: {
    metadata: {
      name: 'nginx-deployment',
      namespace: 'default',
      labels: { app: 'nginx' },
    },
    spec: {
      selector: {
        matchLabels: { app: 'nginx' },
      },
      template: {
        metadata: {
          labels: { app: 'nginx' },
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
        },
      },
    },
  },
};

export const MultipleContainers = Template.bind({});
MultipleContainers.args = {
  resource: {
    metadata: {
      name: 'multi-container-deployment',
      namespace: 'apps',
    },
    spec: {
      selector: {
        matchLabels: { app: 'myapp' },
      },
      template: {
        metadata: {
          labels: { app: 'myapp' },
        },
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
    },
  },
};

export const WithNodeName = Template.bind({});
WithNodeName.args = {
  resource: {
    metadata: {
      name: 'pinned-deployment',
    },
    spec: {
      selector: {
        matchLabels: { app: 'worker' },
      },
      template: {
        metadata: {
          labels: { app: 'worker' },
        },
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
    },
  },
};
