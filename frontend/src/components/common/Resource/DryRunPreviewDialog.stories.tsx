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
import { TestContext } from '../../../test';
import DryRunPreviewDialog from './DryRunPreviewDialog';

export default {
  title: 'Resource/DryRunPreviewDialog',
  component: DryRunPreviewDialog,
  argTypes: {
    onClose: { action: 'closed' },
  },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const baseItem = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: {
    name: 'nginx-deployment',
    namespace: 'default',
    uid: '12345',
    resourceVersion: '1',
    creationTimestamp: '2026-06-11T10:00:00Z',
    managedFields: [
      {
        manager: 'kubectl-client-side-apply',
        operation: 'Update',
        apiVersion: 'apps/v1',
        subresource: '',
        timestamp: '2026-06-11T10:00:00Z',
        fieldsType: 'FieldsV1',
        fieldsV1: {},
      },
    ],
  },
  spec: {
    replicas: 3,
    selector: {
      matchLabels: {
        app: 'nginx',
      },
    },
    template: {
      metadata: {
        labels: {
          app: 'nginx',
        },
      },
      spec: {
        containers: [
          {
            name: 'nginx',
            image: 'nginx:1.25',
            ports: [{ containerPort: 80 }],
          },
        ],
      },
    },
  },
};

const Template: StoryFn<typeof DryRunPreviewDialog> = args => <DryRunPreviewDialog {...args} />;

export const Open = Template.bind({});
Open.args = {
  open: true,
  title: 'Dry Run Preview',
  item: baseItem,
};

export const Closed = Template.bind({});
Closed.args = {
  open: false,
  title: 'Dry Run Preview',
  item: baseItem,
};

export const LargeYaml = Template.bind({});
LargeYaml.args = {
  open: true,
  title: 'Dry Run Preview',
  item: {
    ...baseItem,
    spec: {
      ...baseItem.spec,
      template: {
        ...baseItem.spec.template,
        spec: {
          containers: Array.from({ length: 15 }, (_, index) => ({
            name: `container-${index + 1}`,
            image: `example/image-${index + 1}:latest`,
            env: [
              { name: 'ENVIRONMENT', value: 'storybook' },
              { name: 'LOG_LEVEL', value: 'debug' },
            ],
          })),
        },
      },
    },
  },
};
