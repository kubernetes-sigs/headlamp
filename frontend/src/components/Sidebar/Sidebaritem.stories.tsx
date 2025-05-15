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

import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import { Meta, StoryFn } from '@storybook/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import store from '../../redux/stores/store';
import SidebarItem, { SidebarItemProps } from './SidebarItem';

export default {
  title: 'Sidebar/SidebarItem',
  component: SidebarItem,
  argTypes: {},
  decorators: [
    Story => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} as Meta;

const Template: StoryFn<SidebarItemProps> = args => {
  return (
    <Provider store={store}>
      <Grid item style={{ backgroundColor: 'rgba(0, 0, 0, 0.87)' }}>
        <List>
          <SidebarItem {...args} />
        </List>
      </Grid>
    </Provider>
  );
};

export const Selected = Template.bind({});
Selected.args = {
  isSelected: true,
  name: 'cluster',
  label: 'Cluster',
  icon: 'mdi:hexagon-multiple-outline',
  fullWidth: true,
};

export const Unselected = Template.bind({});
Unselected.args = {
  isSelected: false,
  name: 'cluster',
  label: 'Cluster',
  icon: 'mdi:hexagon-multiple-outline',
  fullWidth: true,
};

export const SublistExpanded = Template.bind({});
SublistExpanded.args = {
  isSelected: true,
  name: 'cluster',
  label: 'Cluster',
  fullWidth: true,
  icon: 'mdi:hexagon-multiple-outline',
  subList: [
    {
      isSelected: false,
      name: 'namespaces',
      label: 'Namespaces',
      hasParent: true,
    },
  ],
};

export const Sublist = Template.bind({});
Sublist.args = {
  isSelected: false,
  name: 'cluster',
  label: 'Cluster',
  fullWidth: true,
  icon: 'mdi:hexagon-multiple-outline',
  subList: [
    {
      isSelected: false,
      name: 'namespaces',
      label: 'Namespaces',
      hasParent: true,
    },
  ],
};
