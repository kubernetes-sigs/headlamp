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

import { Paper } from '@mui/material';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import HeadlampButton, { HeadlampButtonProps } from './HeadlampButton';
export default {
  title: 'Sidebar/HeadlampButton',
  component: HeadlampButton,
  decorators: [
    Story => (
      <Provider store={store}>
        <TestContext>
          <Paper
            elevation={0}
            sx={{ padding: 2, display: 'inline-block', backgroundColor: 'sidebar.background' }}
          >
            <Story />
          </Paper>
        </TestContext>
      </Provider>
    ),
  ],
  argTypes: {
    open: {
      control: 'boolean',
      description:
        'Whether the sidebar is considered open (displays expanded logo and backburger).',
    },
    mobileOnly: {
      control: 'boolean',
      description: 'If true, only shows on mobile when sidebar is closed.',
    },
    onToggleOpen: { action: 'toggled', description: 'Callback when the button is clicked.' },
    disabled: { control: 'boolean', description: 'If true, the button is disabled.' },
  },
} as Meta<typeof HeadlampButton>;

const Template: StoryFn<HeadlampButtonProps> = args => <HeadlampButton {...args} />;

export const ExpandedSidebar = Template.bind({});
ExpandedSidebar.args = {
  open: true,
  onToggleOpen: () => console.log('Toggle open/closed'),
};
ExpandedSidebar.storyName = 'Sidebar Open (Expanded View)';

export const CollapsedSidebar = Template.bind({});
CollapsedSidebar.args = {
  open: false,
  onToggleOpen: () => console.log('Toggle open/closed'),
};
CollapsedSidebar.storyName = 'Sidebar Closed (Collapsed View)';

export const Disabled = Template.bind({});
Disabled.args = {
  open: true,
  disabled: true,
  onToggleOpen: () => console.log('Toggle open/closed (should not fire)'),
};
export const MobileOnlyVisible = Template.bind({});
MobileOnlyVisible.args = {
  open: false,
  mobileOnly: true,
  onToggleOpen: () => console.log('Toggle open/closed'),
};
MobileOnlyVisible.storyName = 'MobileOnly (Simulated: Small Screen, Sidebar Closed)';
MobileOnlyVisible.parameters = {
  viewport: {
    defaultViewport: 'iphonex',
  },
};

export const MobileOnlyHidden = Template.bind({});
MobileOnlyHidden.args = {
  open: true,
  mobileOnly: true,
  onToggleOpen: () => console.log('Toggle open/closed'),
};
MobileOnlyHidden.storyName = 'MobileOnly (Simulated: Sidebar Open or Not Mobile)';
