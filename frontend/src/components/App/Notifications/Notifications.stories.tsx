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
import { http, HttpResponse } from 'msw';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { getTestDate } from '../../../helpers/testHelpers';
import Notifications from './Notifications';
import { Notification } from './notificationsSlice';

const createTestNotification = (
  message: string,
  seen = false,
  deleted = false,
  cluster?: string
) => {
  const notification = new Notification({
    message,
    date: getTestDate().getTime(),
    cluster,
  });
  notification.seen = seen;
  notification.deleted = deleted;
  notification.id = Math.random().toString();
  return notification;
};

const createStore = (notifications: Notification[] = [], clusters = {}) =>
  configureStore({
    reducer: {
      notifications: (state = { notifications }) => state,
      config: (state = { clusters }) => state,
    },
    preloadedState: {
      notifications: { notifications },
      config: { clusters },
    },
  });

export default {
  title: 'Notifications',
  component: Notifications,
  decorators: [
    Story => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/clusters/staging-cluster/api/v1/events', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/clusters/dev-cluster/api/v1/events', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/clusters/prod-cluster/api/v1/events', () =>
            HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => <Notifications />;

export const NoNotifications = Template.bind({});
NoNotifications.decorators = [
  Story => (
    <Provider store={createStore()}>
      <Story />
    </Provider>
  ),
];

export const WithUnreadNotifications = Template.bind({});
WithUnreadNotifications.decorators = [
  Story => (
    <Provider
      store={createStore([
        createTestNotification('Deployment my-app is running low on resources', false),
        createTestNotification('Pod my-pod-123 is in CrashLoopBackOff state', false),
        createTestNotification('Node worker-1 is NotReady', false),
      ])}
    >
      <Story />
    </Provider>
  ),
];

export const WithReadNotifications = Template.bind({});
WithReadNotifications.decorators = [
  Story => (
    <Provider
      store={createStore([
        createTestNotification('Deployment my-app scaled to 3 replicas', true),
        createTestNotification('Service my-service created successfully', true),
        createTestNotification('ConfigMap updated: app-config', true),
      ])}
    >
      <Story />
    </Provider>
  ),
];

export const MixedNotifications = Template.bind({});
MixedNotifications.decorators = [
  Story => (
    <Provider
      store={createStore([
        createTestNotification('New unread alert: High CPU usage', false),
        createTestNotification('Previous alert: Memory threshold exceeded', true),
        createTestNotification('Critical: Database connection failed', false),
        createTestNotification('Info: Backup completed successfully', true),
      ])}
    >
      <Story />
    </Provider>
  ),
];

export const WithMultipleClusters = Template.bind({});
WithMultipleClusters.decorators = [
  Story => (
    <Provider
      store={createStore(
        [
          createTestNotification(
            'Production alert: Service degraded',
            false,
            false,
            'prod-cluster'
          ),
          createTestNotification(
            'Staging: New deployment available',
            true,
            false,
            'staging-cluster'
          ),
          createTestNotification('Dev: Test suite failed', false, false, 'dev-cluster'),
        ],
        {
          'prod-cluster': { name: 'prod-cluster' },
          'staging-cluster': { name: 'staging-cluster' },
          'dev-cluster': { name: 'dev-cluster' },
        }
      )}
    >
      <Story />
    </Provider>
  ),
];
