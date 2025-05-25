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

import { Box, Typography } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../../test';
import { HoverInfoLabel, HoverInfoLabelProps } from '../Label';

export default {
  title: 'Labels/HoverInfoLabel',
  component: HoverInfoLabel,
  decorators: [
    Story => (
      <TestContext>
        <Box sx={{ padding: 2 }}>
          <Story />
        </Box>
      </TestContext>
    ),
  ],
  argTypes: {
    label: { control: 'text', description: 'The main label text.' },
    hoverInfo: {
      control: 'text',
      description: 'Information to display on hover (string or ReactNode).',
    },
    icon: {
      control: 'text',
      description: 'Iconify string for the icon (e.g., "mdi:information-outline").',
    },
    iconPosition: {
      control: 'radio',
      options: ['start', 'end'],
      description: 'Position of the icon relative to the label.',
    },
    labelProps: {
      control: 'object',
      description: 'Props to pass to the label Typography component.',
    },
    iconProps: { control: 'object', description: 'Props to pass to the Icon component.' },
  },
} as Meta<typeof HoverInfoLabel>;

const Template: StoryFn<HoverInfoLabelProps> = args => <HoverInfoLabel {...args} />;

export const Default = Template.bind({});
Default.args = {
  label: 'Creation Timestamp',
  hoverInfo: 'The time at which this resource was created.',
};
Default.storyName = 'Basic HoverInfoLabel';

export const WithCustomIcon = Template.bind({});
WithCustomIcon.args = {
  label: 'Status Details',
  hoverInfo: 'Current operational status of the resource.',
  icon: 'mdi:help-circle-outline',
};
WithCustomIcon.storyName = 'With Custom Icon';

export const WithReactNodeAsHoverInfo = Template.bind({});
WithReactNodeAsHoverInfo.args = {
  label: 'Complex Information',
  hoverInfo: (
    <>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
        Detailed Breakdown
      </Typography>
      <ul>
        <li>Point one about the complex information.</li>
        <li>Point two with further details.</li>
      </ul>
    </>
  ),
};
WithReactNodeAsHoverInfo.storyName = 'With ReactNode as HoverInfo';

export const IconAtStart = Template.bind({});
IconAtStart.args = {
  label: 'Information First',
  hoverInfo: 'The information icon appears before the label text.',
  iconPosition: 'start',
};
IconAtStart.storyName = 'Icon Position Start';

export const CustomLabelStyling = Template.bind({});
CustomLabelStyling.args = {
  label: 'Important System Label',
  hoverInfo: 'This label uses custom typography styling.',
  labelProps: {
    variant: 'h6',
    color: 'error.dark',
    sx: { fontStyle: 'italic' },
  },
};
CustomLabelStyling.storyName = 'With Custom Label Styling';

export const CustomIconProps = Template.bind({});
CustomIconProps.args = {
  label: 'Label with Big Icon',
  hoverInfo: 'The icon next to this label is larger and has a different color.',
  iconProps: {
    width: '1.5rem',
    height: '1.5rem',
    color: 'purple',
  },
};
CustomIconProps.storyName = 'With Custom Icon Props';
