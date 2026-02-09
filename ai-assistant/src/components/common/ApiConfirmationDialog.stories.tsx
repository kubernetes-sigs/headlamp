import { Meta, StoryFn } from '@storybook/react/types-6-0';
import React from 'react';
import { TestContext } from '@kinvolk/headlamp-plugin/lib/testLib';
import ApiConfirmationDialog from './ApiConfirmationDialog';

export default {
  title: 'components/common/ApiConfirmationDialog',
  component: ApiConfirmationDialog,
  decorators: [
    (Story) => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const mockYamlBody = `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  config.yaml: |
    app:
      name: MyApp
      version: 1.0.0
      debug: true`;

const mockJsonBody = JSON.stringify(
  {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name: 'example-pod',
      namespace: 'default',
    },
    spec: {
      containers: [
        {
          name: 'app',
          image: 'myapp:latest',
          ports: [{ containerPort: 8080 }],
        },
      ],
    },
  },
  null,
  2
);

const Template: StoryFn<typeof ApiConfirmationDialog> = (args) => (
  <div style={{ width: '100%', height: '100vh' }}>
    <ApiConfirmationDialog {...args} />
  </div>
);

export const Default = Template.bind({});
Default.args = {
  open: true,
  method: 'POST',
  url: '/api/v1/namespaces/default/configmaps',
  body: mockYamlBody,
  onClose: () => console.log('Dialog closed'),
  onConfirm: (editedBody, resourceInfo) =>
    console.log('Confirmed', { editedBody, resourceInfo }),
  isLoading: false,
};

export const DeleteOperation = Template.bind({});
DeleteOperation.args = {
  open: true,
  method: 'DELETE',
  url: '/api/v1/namespaces/default/pods/example-pod',
  body: '',
  onClose: () => console.log('Dialog closed'),
  onConfirm: () => console.log('Delete confirmed'),
  isLoading: false,
};

export const PutUpdateOperation = Template.bind({});
PutUpdateOperation.args = {
  open: true,
  method: 'PUT',
  url: '/api/v1/namespaces/default/pods/example-pod',
  body: mockJsonBody,
  onClose: () => console.log('Dialog closed'),
  onConfirm: (editedBody) => console.log('Update confirmed:', editedBody),
  isLoading: false,
};

export const LoadingState = Template.bind({});
LoadingState.args = {
  open: true,
  method: 'POST',
  url: '/api/v1/namespaces/default/configmaps',
  body: mockYamlBody,
  onClose: () => console.log('Dialog closed'),
  onConfirm: () => console.log('Confirmed'),
  isLoading: true,
};

export const WithError = Template.bind({});
WithError.args = {
  open: true,
  method: 'POST',
  url: '/api/v1/namespaces/default/configmaps',
  body: mockYamlBody,
  onClose: () => console.log('Dialog closed'),
  onConfirm: () => console.log('Confirmed'),
  isLoading: false,
  error: 'Failed to create resource: ConfigMap already exists',
};

export const Empty = Template.bind({});
Empty.args = {
  open: true,
  method: 'GET',
  url: '/api/v1/namespaces/default/pods',
  body: '',
  onClose: () => console.log('Dialog closed'),
  onConfirm: () => console.log('Confirmed'),
  isLoading: false,
};
