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
import ServiceAccountDetails from './Details';
import { BASE_EMPTY_SERVICE_ACCOUNT, BASE_SERVICE_ACCOUNT } from './storyHelper';

export default {
  title: 'ServiceAccount/DetailsView',
  component: ServiceAccountDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
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
            HttpResponse.error()
          ),
          http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <ServiceAccountDetails />;
};

export const WithBase = Template.bind({});
WithBase.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces/default/serviceaccounts/my-sa`, () =>
          HttpResponse.json(BASE_SERVICE_ACCOUNT)
        ),
      ],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces/default/serviceaccounts/my-sa`, () =>
          HttpResponse.json(BASE_EMPTY_SERVICE_ACCOUNT)
        ),
      ],
    },
  },
};
