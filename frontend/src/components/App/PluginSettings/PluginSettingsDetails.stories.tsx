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

import { TextField } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { PluginInfo, PluginSettingsDetailsProps } from '../../../plugin/pluginsSlice';
import { PluginSettingsDetailsPure, PluginSettingsDetailsPureProps } from './PluginSettingsDetails';

const testAutoSaveComponent: React.FC<PluginSettingsDetailsProps> = () => {
  const [data, setData] = React.useState<{ [key: string]: any }>({});
  const onChange = (value: string) => {
    setData({ works: value });
  };

  return (
    <TextField
      value={data?.works || ''}
      onChange={e => onChange(e.target.value)}
      label="Normal Input"
      variant="outlined"
      fullWidth
    />
  );
};

const testNormalComponent: React.FC<PluginSettingsDetailsProps> = props => {
  const { data, onDataChange } = props;

  function onChange(value: string) {
    if (onDataChange) {
      onDataChange({ works: value });
    }
  }

  return (
    <TextField
      value={data?.works || ''}
      onChange={e => onChange(e.target.value)}
      label="Normal Input"
      variant="outlined"
      fullWidth
    />
  );
};

// Mock PluginInfo data
const mockPluginInfoAutoSave: PluginInfo = {
  name: 'Example Plugin AutoSave',
  description: 'This is an example plugin with auto-save enabled.',
  version: '0.0.1',
  homepage: 'https://example.com/plugin-auto-save',
  settingsComponent: testAutoSaveComponent,
  displaySettingsComponentWithSaveButton: false,
};

const mockPluginInfoNormal: PluginInfo = {
  name: 'Example Plugin Normal',
  description: 'This is an example plugin with normal save.',
  version: '0.0.1',
  homepage: 'https://example.com/plugin-normal',
  settingsComponent: testNormalComponent,
  displaySettingsComponentWithSaveButton: true,
};

const mockConfig = {
  name: 'mockPlugin',
};

const Template: StoryFn<PluginSettingsDetailsPureProps> = (
  args: PluginSettingsDetailsPureProps
) => <PluginSettingsDetailsPure {...args} />;

export const WithAutoSave = Template.bind({});
WithAutoSave.args = {
  plugin: mockPluginInfoAutoSave,
  onDelete: () => console.log('Delete action'),
};

export const WithoutAutoSave = Template.bind({});
WithoutAutoSave.args = {
  config: mockConfig,
  plugin: mockPluginInfoNormal,
  onSave: (data: { [key: string]: any }) => console.log('Save data:', data),
  onDelete: () => console.log('Delete action'),
};

export default {
  title: 'Settings/PluginSettingsDetail',
  component: PluginSettingsDetailsPure,
} as Meta;
