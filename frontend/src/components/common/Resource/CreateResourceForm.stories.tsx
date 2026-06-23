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
import CreateResourceForm, { CreateResourceFormProps } from './CreateResourceForm';

export default {
  title: 'Resource/CreateResourceForm',
  component: CreateResourceForm,
  argTypes: { onChange: { action: 'changed' } },
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<CreateResourceFormProps> = args => <CreateResourceForm {...args} />;

export const TextFields = Template.bind({});
TextFields.args = {
  resource: { metadata: { name: '', namespace: '' } },
  sections: [
    {
      title: 'Metadata',
      fields: [
        { key: 'name', path: 'metadata.name', label: 'Name', required: true },
        {
          key: 'namespace',
          path: 'metadata.namespace',
          label: 'Namespace',
          helperText: 'The namespace for this resource',
        },
      ],
    },
  ],
};

export const SelectField = Template.bind({});
SelectField.args = {
  resource: { spec: { restartPolicy: 'Always' } },
  sections: [
    {
      title: 'Spec',
      fields: [
        {
          key: 'restartPolicy',
          path: 'spec.restartPolicy',
          label: 'Restart Policy',
          type: 'select',
          options: [
            { value: 'Always', label: 'Always' },
            { value: 'OnFailure', label: 'On Failure' },
            { value: 'Never', label: 'Never' },
          ],
        },
      ],
    },
  ],
};

export const Labels = Template.bind({});
Labels.args = {
  resource: { metadata: { labels: { app: 'frontend', env: 'production' } } },
  sections: [
    {
      title: 'Metadata',
      fields: [{ key: 'labels', path: 'metadata.labels', label: 'Labels', type: 'labels' }],
    },
  ],
};

export const Containers = Template.bind({});
Containers.args = {
  resource: {
    spec: {
      containers: [
        {
          name: 'nginx',
          image: 'nginx:latest',
          ports: [{ containerPort: 80 }],
          imagePullPolicy: 'Always',
        },
      ],
    },
  },
  sections: [
    {
      title: 'Containers',
      fields: [
        { key: 'containers', path: 'spec.containers', label: 'Containers', type: 'containers' },
      ],
    },
  ],
};

export const NamespaceAutocomplete = Template.bind({});
NamespaceAutocomplete.args = {
  resource: { metadata: { namespace: 'default' } },
  sections: [
    {
      title: 'Metadata',
      fields: [
        { key: 'namespace', path: 'metadata.namespace', label: 'Namespace', type: 'namespace' },
      ],
    },
  ],
};

export const MultipleSections = Template.bind({});
MultipleSections.args = {
  resource: {
    metadata: { name: 'my-pod', namespace: 'default', labels: { app: 'web' } },
    spec: {
      containers: [
        {
          name: 'app',
          image: 'node:20',
          ports: [{ containerPort: 3000 }],
          imagePullPolicy: 'IfNotPresent',
        },
      ],
      nodeName: '',
    },
  },
  sections: [
    {
      title: 'Metadata',
      fields: [
        { key: 'name', path: 'metadata.name', label: 'Name', required: true },
        { key: 'namespace', path: 'metadata.namespace', label: 'Namespace', type: 'namespace' },
        { key: 'labels', path: 'metadata.labels', label: 'Labels', type: 'labels' },
      ],
    },
    {
      title: 'Containers',
      fields: [
        { key: 'containers', path: 'spec.containers', label: 'Containers', type: 'containers' },
      ],
    },
    {
      title: 'Node',
      fields: [
        {
          key: 'nodeName',
          path: 'spec.nodeName',
          label: 'Node Name',
          helperText: 'Optional: schedule the pod on a specific node',
        },
      ],
    },
  ],
};

export const EmptyForm = Template.bind({});
EmptyForm.args = {
  resource: {},
  sections: [
    {
      title: 'Metadata',
      fields: [{ key: 'name', path: 'metadata.name', label: 'Name', required: true }],
    },
  ],
};
