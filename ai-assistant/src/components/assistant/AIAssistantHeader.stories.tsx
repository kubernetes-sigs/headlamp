import { Meta, StoryFn } from '@storybook/react/types-6-0';
import React from 'react';
import { TestContext } from '@kinvolk/headlamp-plugin/lib/testLib';
import AIAssistantHeader from './AIAssistantHeader';

export default {
  title: 'components/assistant/AIAssistantHeader',
  component: AIAssistantHeader,
  decorators: [
    (Story) => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof AIAssistantHeader> = (args) => <AIAssistantHeader {...args} />;

export const Default = Template.bind({});
Default.args = {
  isTestMode: false,
  disableSettingsButton: false,
  onClose: () => console.log('Close clicked'),
};

export const TestMode = Template.bind({});
TestMode.args = {
  isTestMode: true,
  disableSettingsButton: false,
  onClose: () => console.log('Close clicked'),
};

export const DisabledSettings = Template.bind({});
DisabledSettings.args = {
  isTestMode: false,
  disableSettingsButton: true,
  onClose: () => console.log('Close clicked'),
};
