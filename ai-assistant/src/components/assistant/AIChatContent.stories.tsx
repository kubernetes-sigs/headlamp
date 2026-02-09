import { Meta, StoryFn } from '@storybook/react/types-6-0';
import React from 'react';
import { TestContext } from '@kinvolk/headlamp-plugin/lib/testLib';
import AIChatContent from './AIChatContent';

export default {
  title: 'components/assistant/AIChatContent',
  component: AIChatContent,
  decorators: [
    (Story) => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const mockPromptHistory = [
  {
    role: 'user',
    content: 'What is the status of my pods?',
  },
  {
    role: 'assistant',
    content: 'Based on the current cluster status, all pods are running normally. No issues detected.',
  },
  {
    role: 'user',
    content: 'Show me the deployment YAML',
  },
  {
    role: 'assistant',
    content: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: example-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: example`,
  },
];

const Template: StoryFn<typeof AIChatContent> = (args) => <AIChatContent {...args} />;

export const Default = Template.bind({});
Default.args = {
  history: mockPromptHistory,
  isLoading: false,
  apiError: null,
  onOperationSuccess: (response) => console.log('Operation success:', response),
  onOperationFailure: (error, type, info) => console.log('Operation failed:', error, type, info),
  onYamlAction: (yaml, title, type, isDelete) => console.log('YAML Action:', { yaml, title, type, isDelete }),
};

export const Empty = Template.bind({});
Empty.args = {
  history: [],
  isLoading: false,
  apiError: null,
  onOperationSuccess: (response) => console.log('Operation success:', response),
  onOperationFailure: (error, type, info) => console.log('Operation failed:', error, type, info),
  onYamlAction: (yaml, title, type, isDelete) => console.log('YAML Action:', { yaml, title, type, isDelete }),
};

export const WithError = Template.bind({});
WithError.args = {
  history: [],
  isLoading: false,
  apiError: 'Failed to connect to AI service. Please check your API credentials in Settings.',
  onOperationSuccess: (response) => console.log('Operation success:', response),
  onOperationFailure: (error, type, info) => console.log('Operation failed:', error, type, info),
  onYamlAction: (yaml, title, type, isDelete) => console.log('YAML Action:', { yaml, title, type, isDelete }),
};

export const Loading = Template.bind({});
Loading.args = {
  history: mockPromptHistory,
  isLoading: true,
  apiError: null,
  onOperationSuccess: (response) => console.log('Operation success:', response),
  onOperationFailure: (error, type, info) => console.log('Operation failed:', error, type, info),
  onYamlAction: (yaml, title, type, isDelete) => console.log('YAML Action:', { yaml, title, type, isDelete }),
};
