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
import Details from './Details';
import { SERVICE_ACCOUNT_DUMMY_DATA } from './storyHelper';

export default {
  title: 'serviceaccount/Details',
  component: Details,
  decorators: [
    Story => (
      <TestContext routerMap={{ name: 'my-service-account', namespace: 'default' }}>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn = () => <Details name="my-service-account" namespace="default" />;

export const Loading = Template.bind({});
Loading.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/my-service-account',
          () => HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[0])
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
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/my-service-account',
          () => HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[0])
        ),
      ],
    },
  },
};
