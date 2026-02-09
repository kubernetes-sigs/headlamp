import { Meta, StoryFn } from '@storybook/react/types-6-0';
import React from 'react';
import { TestContext } from '@kinvolk/headlamp-plugin/lib/testLib';
import LogsButton from './LogsButton';

export default {
  title: 'components/common/LogsButton',
  component: LogsButton,
  decorators: [
    (Story) => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const mockLogs = `2025-02-09T10:15:30Z - INFO - Application started
2025-02-09T10:15:31Z - DEBUG - Initializing database connection
2025-02-09T10:15:32Z - DEBUG - Database connection established
2025-02-09T10:15:33Z - INFO - Server listening on port 8080
2025-02-09T10:15:40Z - INFO - Request received from 192.168.1.100
2025-02-09T10:15:41Z - DEBUG - Processing request...
2025-02-09T10:15:42Z - INFO - Response sent successfully`;

const Template: StoryFn<typeof LogsButton> = (args) => <LogsButton {...args} />;

export const Default = Template.bind({});
Default.args = {
  logs: mockLogs,
  resourceName: 'api-server',
  resourceType: 'Deployment',
  namespace: 'default',
  containerName: 'api',
};

export const WithoutContainerName = Template.bind({});
WithoutContainerName.args = {
  logs: mockLogs,
  resourceName: 'nginx-pod',
  resourceType: 'Pod',
  namespace: 'production',
};

export const Empty = Template.bind({});
Empty.args = {
  logs: '',
  resourceName: 'empty-pod',
  resourceType: 'Pod',
  namespace: 'default',
};

export const WithoutMetadata = Template.bind({});
WithoutMetadata.args = {
  logs: 'Simple log output without metadata',
};

export const LongLogs = Template.bind({});
LongLogs.args = {
  logs: Array(100)
    .fill(0)
    .map((_, i) => `${new Date().toISOString()} - Line ${i + 1} of log output`)
    .join('\n'),
  resourceName: 'database',
  resourceType: 'StatefulSet',
  namespace: 'databases',
  containerName: 'postgres',
};
