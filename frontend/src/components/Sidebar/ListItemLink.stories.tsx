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

import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import ListItemLink from './ListItemLink';
interface ListItemLinkStoryProps {
  primary: string;
  pathname: string;
  search?: string;
  name: string;
  subtitle?: string;
  icon?: string;
  iconOnly?: boolean;
  hasParent?: boolean;
  fullWidth?: boolean;
  selected?: boolean;
  divider?: boolean;
}

import { List, Paper } from '@mui/material';
import { TestContext } from '../../test';
export default {
  title: 'Sidebar/ListItemLink',
  component: ListItemLink,
  decorators: [
    Story => (
      <TestContext>
        <Paper elevation={0} sx={{ width: 240, bgcolor: 'sidebar.background', padding: 1 }}>
          <nav>
            <List component="ul">
              <Story />
            </List>
          </nav>
        </Paper>
      </TestContext>
    ),
  ],
  argTypes: {
    primary: {
      control: 'text',
      description: 'Primary text of the list item (shown when not iconOnly).',
    },
    pathname: { control: 'text', description: 'The path for the link.' },
    search: { control: 'text', description: 'Optional search string for the link.' },
    name: {
      control: 'text',
      description: 'Name for tooltip (especially when iconOnly) and accessibility.',
    },
    subtitle: { control: 'text', description: 'Subtitle text, shown below primary.' },
    icon: { control: 'text', description: 'Iconify string for the icon (e.g., "mdi:home").' },
    iconOnly: {
      control: 'boolean',
      description: 'If true, only the icon is shown (for collapsed sidebar).',
    },
    hasParent: { control: 'boolean', description: 'If true, applies styling for a sub-item.' },
    fullWidth: {
      control: 'boolean',
      description: '(deprecated by iconOnly) If true, shows text; otherwise icon only.',
    },
    selected: { control: 'boolean', description: 'If true, applies selected styling.' },
    divider: { control: 'boolean', description: 'If true, shows a divider at the bottom.' },
  },
} as Meta<typeof ListItemLink>;

const Template: StoryFn<ListItemLinkStoryProps> = args => <ListItemLink {...args} />;

export const Default = Template.bind({});
Default.args = {
  primary: 'Dashboard',
  pathname: '/dashboard',
  name: 'Dashboard',
  icon: 'mdi:view-dashboard-outline',
  iconOnly: false,
  selected: false,
};
Default.storyName = 'Default (Expanded)';

export const Selected = Template.bind({});
Selected.args = {
  ...Default.args,
  selected: true,
};
Selected.storyName = 'Selected (Expanded)';

export const WithSubtitle = Template.bind({});
WithSubtitle.args = {
  primary: 'Cluster Info',
  pathname: '/cluster-info',
  name: 'Cluster Information',
  subtitle: 'Details about your cluster',
  icon: 'mdi:information-outline',
  iconOnly: false,
};

export const IconOnly = Template.bind({});
IconOnly.args = {
  primary: 'Workloads',
  pathname: '/workloads',
  name: 'Workloads',
  icon: 'mdi:layers-triple-outline',
  iconOnly: true,
  selected: false,
};
IconOnly.storyName = 'Icon Only (Collapsed)';

export const IconOnlySelected = Template.bind({});
IconOnlySelected.args = {
  ...IconOnly.args,
  selected: true,
};
IconOnlySelected.storyName = 'Icon Only Selected';

export const SubItem = Template.bind({});
SubItem.args = {
  primary: 'Pods',
  pathname: '/pods',
  name: 'Pods',
  icon: 'mdi:kubernetes',
  iconOnly: false,
  hasParent: true,
  selected: false,
};
SubItem.storyName = 'Sub-Item (Expanded)';

export const SubItemSelected = Template.bind({});
SubItemSelected.args = {
  ...SubItem.args,
  selected: true,
};
SubItemSelected.storyName = 'Sub-Item Selected';

export const WithDivider = Template.bind({});
WithDivider.args = {
  primary: 'Settings',
  pathname: '/settings',
  name: 'Settings',
  icon: 'mdi:cog-outline',
  iconOnly: false,
  divider: true,
};

export const NoIcon = Template.bind({});
NoIcon.args = {
  primary: 'External Link',
  pathname: 'https://headlamp.dev',
  name: 'Headlamp Website',
  iconOnly: false,
};

export const UsingFullWidthPropTrue = Template.bind({});
UsingFullWidthPropTrue.args = {
  primary: 'Full Width True',
  pathname: '/full-width-true',
  name: 'Full Width True',
  icon: 'mdi:arrow-expand-all',
  fullWidth: true,
  iconOnly: undefined,
};
UsingFullWidthPropTrue.storyName = 'Legacy: fullWidth=true';

export const UsingFullWidthPropFalse = Template.bind({});
UsingFullWidthPropFalse.args = {
  primary: 'Full Width False',
  pathname: '/full-width-false',
  name: 'Full Width False (Icon Only)',
  icon: 'mdi:arrow-collapse-all',
  fullWidth: false,
  iconOnly: undefined,
};
UsingFullWidthPropFalse.storyName = 'Legacy: fullWidth=false';
