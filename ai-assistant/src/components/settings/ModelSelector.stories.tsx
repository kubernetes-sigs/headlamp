import { Meta, StoryFn } from '@storybook/react/types-6-0';
import React from 'react';
import { TestContext } from '@kinvolk/headlamp-plugin/lib/testLib';
import ModelSelector from './ModelSelector';

export default {
  title: 'components/settings/ModelSelector',
  component: ModelSelector,
  decorators: [
    (Story) => (
      <TestContext>
        <div style={{ padding: '20px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
          <Story />
        </div>
      </TestContext>
    ),
  ],
} as Meta;

const mockSavedConfigs = {
  providers: [
    {
      providerId: 'openai',
      config: {
        apiKey: 'sk-test-key-1234567890',
        model: 'gpt-4',
      },
      displayName: 'OpenAI GPT-4',
      isDefault: true,
    },
    {
      providerId: 'anthropic',
      config: {
        apiKey: 'sk-ant-test-key',
        model: 'claude-3-opus',
      },
      displayName: 'Anthropic Claude 3',
      isDefault: false,
    },
  ],
  termsAccepted: true,
};

const mockSavedConfigsEmpty = {
  providers: [],
  termsAccepted: false,
};

const Template: StoryFn<typeof ModelSelector> = (args) => <ModelSelector {...args} />;

export const Default = Template.bind({});
Default.args = {
  selectedProvider: 'openai',
  config: {
    apiKey: 'sk-test-key-1234567890',
    model: 'gpt-4',
  },
  savedConfigs: mockSavedConfigs,
  configName: 'OpenAI GPT-4',
  isConfigView: false,
  onChange: (changes) => console.log('Configuration changed:', changes),
};

export const Empty = Template.bind({});
Empty.args = {
  selectedProvider: 'openai',
  config: {},
  savedConfigs: mockSavedConfigsEmpty,
  configName: '',
  isConfigView: false,
  onChange: (changes) => console.log('Configuration changed:', changes),
};

export const MultipleProviders = Template.bind({});
MultipleProviders.args = {
  selectedProvider: 'openai',
  config: {
    apiKey: 'sk-test-key-1234567890',
    model: 'gpt-4',
  },
  savedConfigs: mockSavedConfigs,
  configName: 'OpenAI GPT-4',
  isConfigView: false,
  onChange: (changes) => console.log('Configuration changed:', changes),
};

export const ConfigView = Template.bind({});
ConfigView.args = {
  selectedProvider: 'anthropic',
  config: {
    apiKey: 'sk-ant-test-key',
    model: 'claude-3-opus',
  },
  savedConfigs: mockSavedConfigs,
  configName: 'Anthropic Claude 3',
  isConfigView: true,
  onChange: (changes) => console.log('Configuration changed:', changes),
};

export const NoConfiguration = Template.bind({});
NoConfiguration.args = {
  selectedProvider: 'openai',
  config: {
    model: 'gpt-3.5-turbo',
  },
  savedConfigs: mockSavedConfigsEmpty,
  configName: '',
  isConfigView: false,
  onChange: (changes) => console.log('Configuration changed:', changes),
};

export const WithTermsAcceptance = Template.bind({});
WithTermsAcceptance.args = {
  selectedProvider: 'openai',
  config: {},
  savedConfigs: mockSavedConfigsEmpty,
  configName: '',
  isConfigView: false,
  onChange: (changes) => console.log('Configuration changed:', changes),
  onTermsAccept: (configs) => console.log('Terms accepted:', configs),
};
