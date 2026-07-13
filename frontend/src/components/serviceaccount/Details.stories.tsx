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
import { http, HttpResponse } from 'msw';
import { API_BASE, TestContext } from '../../test';
import Details from './Details';
import { SERVICE_ACCOUNT_DUMMY_DATA } from './storyHelper';

export default {
  title: 'ServiceAccount/DetailsView',
  component: Details,
  decorators: [
    (Story, context) => {
      const routerMap = context.parameters.routerMap ?? {
        namespace: 'default',
        name: 'my-service-account',
      };
      return (
        <TestContext routerMap={routerMap}>
          <Story />
        </TestContext>
      );
    },
  ],

  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(`${API_BASE}/api/v1/namespaces/default/serviceaccounts`, () =>
            HttpResponse.json({
              kind: 'ServiceAccountList',
              apiVersion: 'v1',
              items: [],
              metadata: {},
            })
          ),
          http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
            HttpResponse.json({ kind: 'EventList', apiVersion: 'v1', items: [], metadata: {} })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => <Details />;

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/api/v1/namespaces/default/serviceaccounts/my-service-account`,
          () => new Promise(() => {})
        ),
      ],
    },
  },
};

export const WithData = Template.bind({});
WithData.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces/default/serviceaccounts/my-service-account`, () =>
          HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[0])
        ),
      ],
    },
  },
};

export const NoSecrets = Template.bind({});
NoSecrets.parameters = {
  routerMap: { name: 'no-secrets-account', namespace: 'default' },
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces/default/serviceaccounts/no-secrets-account`, () =>
          HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[2])
        ),
      ],
    },
  },
};

export const AutomountDisabled = Template.bind({});
AutomountDisabled.parameters = {
  routerMap: { name: 'automount-disabled-account', namespace: 'default' },
  msw: {
    handlers: {
      story: [
        http.get(
          `${API_BASE}/api/v1/namespaces/default/serviceaccounts/automount-disabled-account`,
          () =>
            HttpResponse.json({
              ...SERVICE_ACCOUNT_DUMMY_DATA[1],
              secrets: SERVICE_ACCOUNT_DUMMY_DATA[0].secrets,
            })
        ),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces/default/serviceaccounts/my-service-account`, () =>
          HttpResponse.json({ message: 'Not found' }, { status: 404 })
        ),
      ],
    },
  },
};
