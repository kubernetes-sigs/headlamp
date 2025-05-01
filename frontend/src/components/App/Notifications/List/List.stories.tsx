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
import { initialState as CONFIG_INITIAL_STATE } from '../../../../redux/configSlice';
import { initialState as FILTER_INITIAL_STATE } from '../../../../redux/filterSlice';
import { INITIAL_STATE as UI_INITIAL_STATE } from '../../../../redux/reducers/ui';
import { TestContext } from '../../../../test';
import { loadNotifications, Notification, storeNotifications } from '../notificationsSlice';
import NotificationList from './List';

function createNotifications() {
  const notifications = [];
  for (let i = 0; i < 100; i++) {
    notifications.push(
      new Notification({
        message: `Notification ${i}`,
        date: '2022-08-01',
      })
    );

    if (i % 10 === 0) {
      notifications[i].cluster = 'cluster';
    }
  }

  storeNotifications(notifications);
}

createNotifications();

const store = configureStore({
  reducer: (
    state = {
      filter: { ...FILTER_INITIAL_STATE },
      config: { ...CONFIG_INITIAL_STATE },
      ui: { ...UI_INITIAL_STATE },
    }
  ) => state,
  preloadedState: {
    config: {
      ...CONFIG_INITIAL_STATE,
      // create a few mock data clusters...
      clusters: [
        {
          name: 'cluster',
          server: 'https://example.com/',
          certificateAuthorityData: 'data',
        },
        {
          name: 'cluster2',
          server: 'https://example.com/',
          certificateAuthorityData: 'data',
        },
      ],
    },
    filter: { ...FILTER_INITIAL_STATE },
    ui: {
      ...UI_INITIAL_STATE,
    },
    notifications: {
      notifications: loadNotifications(),
    },
  },
});

export default {
  title: 'Notifications',
  component: NotificationList,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext store={store}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    storyshots: {
      disable: true,
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <NotificationList />;
};

export const List = Template.bind({});
