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

import { Icon } from '@iconify/react';
import { Box } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../../test';
import { StatusLabel, StatusLabelProps } from '../Label';

export default {
  title: 'Labels/StatusLabel',
  component: StatusLabel,
  decorators: [
    Story => (
      <TestContext>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Story />
        </Box>
      </TestContext>
    ),
  ],
  argTypes: {
    status: {
      control: 'select',
      options: ['success', 'warning', 'error', ''],
      description: 'The status type, which determines the color scheme.',
    },
    children: {
      control: 'text',
      description: 'The text content or React node for the status label.',
    },
    sx: {
      control: 'object',
      description: 'Custom MUI sx props for styling.',
    },
  },
} as Meta<typeof StatusLabel>;

const Template: StoryFn<StatusLabelProps> = args => <StatusLabel {...args} />;

export const Success = Template.bind({});
Success.args = {
  status: 'success',
  children: 'Ready',
};

export const Warning = Template.bind({});
Warning.args = {
  status: 'warning',
  children: 'Pending',
};

export const Error = Template.bind({});
Error.args = {
  status: 'error',
  children: 'Failed',
};

export const Neutral = Template.bind({});
Neutral.args = {
  status: '',
  children: 'Unknown',
};
Neutral.storyName = 'Neutral (Empty Status)';

export const WithIcon = Template.bind({});
WithIcon.args = {
  status: 'success',
  children: (
    <>
      <Icon icon="mdi:check-circle-outline" style={{ marginRight: '4px' }} />
      Verified
    </>
  ),
};
WithIcon.storyName = 'With Leading Icon';

export const LongTextStatus = Template.bind({});
LongTextStatus.args = {
  status: 'warning',
  children:
    'This is a rather long status message that might need to wrap or be handled by its container.',
};
LongTextStatus.storyName = 'With Long Text';
