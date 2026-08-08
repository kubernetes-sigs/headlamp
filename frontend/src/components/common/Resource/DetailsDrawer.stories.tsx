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

import '../../../i18n/config';
import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import reducers from '../../../redux/reducers/reducers';
import { API_BASE, TestContext } from '../../../test';
import DetailsDrawer from './DetailsDrawer';

export default {
  title: 'Resource/DetailsDrawer',
  component: DetailsDrawer,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn<typeof DetailsDrawer> = () => <DetailsDrawer />;

export const Closed = Template.bind({});
Closed.args = {};

const createOpenStore = () =>
  configureStore({
    reducer: reducers,
    preloadedState: {
      drawerMode: {
        isDetailDrawerEnabled: true,
        selectedResource: {
          kind: 'Pod',
          metadata: { name: 'my-pod', namespace: 'default' },
          cluster: 'minikube',
        },
      },
    },
  });

export const Open: StoryFn<typeof DetailsDrawer> = () => (
  <TestContext store={createOpenStore()}>
    <DetailsDrawer />
  </TestContext>
);
Open.parameters = {
  msw: {
    handlers: {
      storyBase: [
        http.post(
          `${API_BASE}/clusters/minikube/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`,
          () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
        ),
        http.get(`${API_BASE}/clusters/minikube/api/v1/namespaces/default/pods`, () =>
          HttpResponse.json({
            kind: 'PodList',
            apiVersion: 'v1',
            metadata: {},
            items: [
              {
                kind: 'Pod',
                apiVersion: 'v1',
                metadata: { name: 'my-pod', namespace: 'default', uid: '123' },
                spec: { containers: [] },
                status: { phase: 'Running' },
              },
            ],
          })
        ),
        http.get(`${API_BASE}/clusters/minikube/api/v1/namespaces/default/pods/my-pod`, () =>
          HttpResponse.json({
            kind: 'Pod',
            apiVersion: 'v1',
            metadata: { name: 'my-pod', namespace: 'default', uid: '123' },
            spec: { containers: [] },
            status: { phase: 'Running' },
          })
        ),
        http.get(`${API_BASE}/clusters/minikube/api/v1/namespaces/default/events`, () =>
          HttpResponse.json({
            kind: 'EventList',
            items: [],
            metadata: {},
          })
        ),
      ],
    },
  },
};
