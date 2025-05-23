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
import { Button, IconButton } from '@mui/material';
import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { Provider } from 'react-redux';
import Namespace from '../../lib/k8s/namespace';
import { initialState as filterInitialState } from '../../redux/filterSlice';
import { TestContext } from '../../test';
import SectionFilterHeader, { SectionFilterHeaderProps } from './SectionFilterHeader';

type StoryProps = SectionFilterHeaderProps & {
  selectedNamespaces?: string[];
};

const mockNamespaces: Namespace[] = [
  new Namespace({
    metadata: { name: 'default', creationTimestamp: '2024-01-01T00:00:00Z', uid: '1' },
    kind: 'Namespace',
    status: { phase: 'Active' },
  }),
  new Namespace({
    metadata: { name: 'kube-system', creationTimestamp: '2024-01-01T00:00:00Z', uid: '2' },
    kind: 'Namespace',
    status: { phase: 'Active' },
  }),
  new Namespace({
    metadata: { name: 'monitoring', creationTimestamp: '2024-01-01T00:00:00Z', uid: '3' },
    kind: 'Namespace',
    status: { phase: 'Active' },
  }),
  new Namespace({
    metadata: {
      name: 'app-namespace-long-name-example',
      creationTimestamp: '2024-01-01T00:00:00Z',
      uid: '4',
    },
    kind: 'Namespace',
    status: { phase: 'Active' },
  }),
  new Namespace({
    metadata: { name: 'another-ns', creationTimestamp: '2024-01-01T00:00:00Z', uid: '5' },
    kind: 'Namespace',
    status: { phase: 'Active' },
  }),
];

const createMockStore = (selectedNamespaces: string[] = []) => {
  const storybookFilterSlice = createSlice({
    name: 'filter',
    initialState: { ...filterInitialState, namespaces: new Set(selectedNamespaces) },
    reducers: {
      setNamespaceFilter: {
        reducer: (state, action: PayloadAction<string[]>) => {
          state.namespaces = new Set(action.payload);
        },
        prepare: (namespaces: string[]) => ({
          payload: namespaces,
          type: 'filter/setNamespaceFilter',
        }),
      },
    },
  });

  return configureStore({
    reducer: {
      filter: storybookFilterSlice.reducer,
      config: (state = { settings: {} }) => state,
      ui: (state = { functionsToOverride: {} }) => state,
    },
  });
};

export default {
  title: 'common/SectionFilterHeader',
  component: SectionFilterHeader,
  decorators: [
    (Story, context: { args: StoryProps }) => {
      const selectedNamespaces = context.args.selectedNamespaces || [];
      const store = createMockStore(selectedNamespaces);
      return (
        <Provider store={store}>
          <TestContext store={store}>
            <Story />
          </TestContext>
        </Provider>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: [
        http.get('/api/v1/namespaces', () => {
          return HttpResponse.json({
            kind: 'NamespaceList',
            items: mockNamespaces.map(ns => ns.jsonData),
            metadata: {},
          });
        }),
      ],
    },
  },
  argTypes: {
    title: { control: 'text' },
    titleSideActions: { control: 'object' },
    actions: { control: 'object' },
    noNamespaceFilter: { control: 'boolean' },
    headerStyle: {
      control: 'select',
      options: ['main', 'subsection', 'normal', 'label'],
    },
    noPadding: { control: 'boolean' },
    selectedNamespaces: {
      control: 'object',
    },
  },
} as Meta<typeof SectionFilterHeader>;

const Template: StoryFn<StoryProps> = args => {
  const { ...headerArgs } = args;
  return <SectionFilterHeader {...headerArgs} />;
};

export const DefaultWithNamespaceFilter = Template.bind({});
DefaultWithNamespaceFilter.args = {
  title: 'My Resources',
  headerStyle: 'main',
};
DefaultWithNamespaceFilter.storyName = 'Default (Namespace Filter Visible)';

export const NoNamespaceFilter = Template.bind({});
NoNamespaceFilter.args = {
  title: 'Cluster Overview',
  noNamespaceFilter: true,
  headerStyle: 'main',
};

export const WithTitleActions = Template.bind({});
WithTitleActions.args = {
  title: 'Deployments',
  headerStyle: 'subsection',
  titleSideActions: [
    <Button key="action1" variant="contained" size="small">
      Create
    </Button>,
  ],
};

export const WithRightSideActions = Template.bind({});
WithRightSideActions.args = {
  title: 'Pods',
  headerStyle: 'normal',
  actions: [
    <IconButton key="refresh" aria-label="refresh" size="small">
      <Icon icon="mdi:refresh" />
    </IconButton>,
    <IconButton key="settings" aria-label="settings" size="small">
      <Icon icon="mdi:cog" />
    </IconButton>,
  ],
};

export const CombinedActionsAndNamespaceFilter = Template.bind({});
CombinedActionsAndNamespaceFilter.args = {
  title: 'Services',
  headerStyle: 'main',
  titleSideActions: [
    <Button key="action1" variant="outlined" size="small">
      Add Service
    </Button>,
  ],
  actions: [
    <Button key="export" variant="text" size="small">
      Export All
    </Button>,
  ],
};

export const NoPadding = Template.bind({});
NoPadding.args = {
  title: 'A Tightly Packed Header',
  headerStyle: 'normal',
  noPadding: true,
  noNamespaceFilter: false,
};

export const WithSelectedNamespaces = Template.bind({});
WithSelectedNamespaces.args = {
  title: 'Filtered Resources',
  headerStyle: 'main',
  selectedNamespaces: ['default', 'kube-system'],
};
WithSelectedNamespaces.storyName = 'With Namespaces Pre-selected';
