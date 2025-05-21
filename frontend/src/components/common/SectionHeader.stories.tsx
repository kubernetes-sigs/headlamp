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

import { Icon } from '@iconify/react'; // For icons in actions
import { Button, Chip, IconButton, Typography } from '@mui/material'; // For example actions
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { TestContext } from '../../test'; // Adjust path as necessary
import SectionHeader, { SectionHeaderProps } from './SectionHeader';

export default {
  title: 'common/SectionHeader', // Categorized under 'common'
  component: SectionHeader,
  decorators: [
    Story => (
      <TestContext>
        {' '}
        {/* Provides MUI Theme */}
        <Story />
      </TestContext>
    ),
  ],
  argTypes: {
    title: {
      control: 'object',
      description: 'The main title string or ReactNode for the section header.',
    },
    subtitle: {
      control: 'object',
      description: 'Optional subtitle string or ReactNode displayed below the title.',
    },
    actions: {
      control: 'object',
      description: 'An array of ReactNodes to display as actions on the right side.',
    },
    noPadding: {
      control: 'boolean',
      description: 'If true, removes the default padding around the header.',
      defaultValue: false,
    },
    headerStyle: {
      control: 'select',
      options: ['main', 'subsection', 'normal', 'label'],
      description: 'Defines the typography style for the title.',
      defaultValue: 'main',
    },
    titleSideActions: {
      control: 'object',
      description: 'React nodes to display to the right of the title, but before main actions.',
    },
  },
} satisfies Meta<typeof SectionHeader>;

const Template: StoryFn<SectionHeaderProps> = args => <SectionHeader {...args} />;

export const MainStyle = Template.bind({});
MainStyle.args = {
  title: 'Main Section Title',
  headerStyle: 'main',
};
MainStyle.storyName = 'Style: Main';

export const SubSectionStyle = Template.bind({});
SubSectionStyle.args = {
  title: 'Subsection Title',
  headerStyle: 'subsection',
  subtitle: 'This is a helpful subtitle for the subsection.',
};
SubSectionStyle.storyName = 'Style: Subsection with Subtitle';

export const NormalStyle = Template.bind({});
NormalStyle.args = {
  title: 'Normal Section Title',
  headerStyle: 'normal',
};
NormalStyle.storyName = 'Style: Normal';

export const LabelStyle = Template.bind({});
LabelStyle.args = {
  title: 'Label Style Title',
  headerStyle: 'label',
};
LabelStyle.storyName = 'Style: Label';

export const WithNoPadding = Template.bind({});
WithNoPadding.args = {
  title: 'Title Without Padding',
  headerStyle: 'normal',
  noPadding: true,
};
WithNoPadding.storyName = 'No Padding';

export const WithActions = Template.bind({});
WithActions.args = {
  title: 'Section With Actions',
  headerStyle: 'subsection',
  actions: [
    <Button key="edit" variant="outlined" size="small">
      Edit
    </Button>,
    <Button key="delete" variant="contained" color="primary" size="small" sx={{ ml: 1 }}>
      Delete
    </Button>,
  ],
};
WithActions.storyName = 'With Actions';

export const WithTitleSideActions = Template.bind({});
WithTitleSideActions.args = {
  title: 'Section with Title-Side Info',
  headerStyle: 'normal',
  titleSideActions: [
    <Chip key="chip1" label="Beta" color="secondary" size="small" sx={{ ml: 1 }} />,
    <IconButton key="icon1" size="small" aria-label="info" sx={{ ml: 0.5 }}>
      <Icon icon="mdi:information-outline" />
    </IconButton>,
  ],
  actions: [
    <Button key="action1" variant="outlined" size="small">
      Configure
    </Button>,
  ],
};
WithTitleSideActions.storyName = 'With Title Side Actions';

export const LongTitle = Template.bind({});
LongTitle.args = {
  title:
    'This is a Very Long Section Title That Might Wrap or Be Ellipsized Depending on Container Width and Typography Settings',
  headerStyle: 'main',
  actions: [
    <Button key="action1" size="small">
      Action 1
    </Button>,
  ],
};
LongTitle.storyName = 'Long Title Handling';

export const WithReactNodeAsTitle = Template.bind({});
WithReactNodeAsTitle.args = {
  title: (
    <>
      <Icon
        icon="mdi:rocket-launch-outline"
        style={{ marginRight: '8px', verticalAlign: 'middle' }}
      />
      <Typography variant="inherit" component="span">
        Launch Control
      </Typography>
    </>
  ),
  headerStyle: 'main',
  subtitle: (
    <Typography variant="caption" color="textSecondary">
      Manage all launch sequences
    </Typography>
  ),
};
WithReactNodeAsTitle.storyName = 'ReactNode as Title/Subtitle';

export const NoActionsOrSubtitle = Template.bind({});
NoActionsOrSubtitle.args = {
  title: 'Just a Title',
  headerStyle: 'normal',
};
NoActionsOrSubtitle.storyName = 'Title Only';
