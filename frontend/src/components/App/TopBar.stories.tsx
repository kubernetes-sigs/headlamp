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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { get } from 'lodash';
import { PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { AppBarActionsProcessor } from '../../redux/actionButtonsSlice';
import { uiSlice } from '../../redux/uiSlice';
import { initialState as themeInitialState } from './themeSlice';
import { processAppBarActions, PureTopBar, PureTopBarProps } from './TopBar';

const store = configureStore({
  reducer: (state = { config: {}, ui: {} }) => state,
  preloadedState: {
    config: {},
    ui: { ...uiSlice.getInitialState() },
    notifications: {
      notifications: [],
    },
    plugins: {
      loaded: true,
    },
    theme: {
      ...themeInitialState,
    },
  },
});

const queryClient = new QueryClient();

export default {
  title: 'TopBar',
  component: PureTopBar,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <MemoryRouter>
          <Provider store={store}>
            <QueryClientProvider client={queryClient}>
              <Story />
            </QueryClientProvider>
          </Provider>
        </MemoryRouter>
      );
    },
  ],
} as Meta;

function OurTopBar(args: PropsWithChildren<PureTopBarProps>) {
  const appBarActions = [{ id: 'moo-thing', action: <p>moo</p> }];
  const appBarActionsProcessors = [
    {
      processor: ({ actions }) => {
        const newActions = actions.filter(action => action && get(action, 'id') !== 'moo-thing');
        newActions.push({ action: <p>meow</p>, id: 'meow-thing' });
        return newActions;
      },
      id: 'no-moo-processor',
    } as AppBarActionsProcessor,
  ];

  return (
    <PureTopBar
      {...args}
      appBarActions={processAppBarActions(appBarActions, appBarActionsProcessors)}
    />
  );
}

const Template: StoryFn<PureTopBarProps> = args => {
  return <OurTopBar {...args} />;
};
export const ProcessorAction = Template.bind({});
ProcessorAction.args = {
  logout: () => {},
};

const PureTemplate: StoryFn<PureTopBarProps> = args => {
  return <PureTopBar {...args} />;
};

export const NoToken = PureTemplate.bind({});
NoToken.args = {
  appBarActions: [],
  logout: () => {},
};

export const Token = PureTemplate.bind({});
Token.args = {
  appBarActions: [],
  logout: () => {},
};

export const OneCluster = PureTemplate.bind({});
OneCluster.args = {
  appBarActions: [],
  logout: () => {},
  cluster: 'ak8s-desktop',
  clusters: { 'ak8s-desktop': '' },
};

export const TwoCluster = PureTemplate.bind({});
TwoCluster.args = {
  appBarActions: [],
  logout: () => {},
  cluster: 'ak8s-desktop',
  clusters: { 'ak8s-desktop': '', 'ak8s-desktop2': '' },
};

export const WithUserInfo = PureTemplate.bind({});
WithUserInfo.args = {
  appBarActions: [],
  logout: () => {},
  cluster: 'ak8s-desktop',
  clusters: { 'ak8s-desktop': '' },
  userInfo: {
    username: 'Ada Lovelace',
    email: 'ada@example.com',
  },
};

export const WithEmailOnly = PureTemplate.bind({});
WithEmailOnly.args = {
  appBarActions: [],
  logout: () => {},
  cluster: 'ak8s-desktop',
  clusters: { 'ak8s-desktop': '' },
  userInfo: {
    email: 'grace@example.com',
  },
};

export const UndefinedData = PureTemplate.bind({});
UndefinedData.args = {
  appBarActions: [],
  logout: () => {},
  cluster: 'ak8s-desktop',
  clusters: { 'ak8s-desktop': '' },
  userInfo: undefined,
};

export const EmptyUserInfo = PureTemplate.bind({});
EmptyUserInfo.args = {
  appBarActions: [],
  logout: () => {},
  cluster: 'ak8s-desktop',
  clusters: { 'ak8s-desktop': '' },
  userInfo: {
    email: '',
    username: '',
  },
};
