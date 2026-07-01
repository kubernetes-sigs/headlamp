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
import { TestContext } from '../../test';
import ServiceAccountDetails from './Details';
import { BASE_EMPTY_SERVICE_ACCOUNT, BASE_SERVICE_ACCOUNT } from './storyHelper';

export default {
  title: 'ServiceAccount/DetailsView',
  component: ServiceAccountDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'my-sa' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/api/v1/serviceaccounts', () => HttpResponse.error()),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <ServiceAccountDetails />;
};

export const WithSecrets = Template.bind({});
WithSecrets.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/serviceaccounts/my-sa', () =>
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
        http.get('http://localhost:4466/api/v1/serviceaccounts/my-sa', () =>
          HttpResponse.json(BASE_EMPTY_SERVICE_ACCOUNT)
        ),
      ],
    },
  },
};
