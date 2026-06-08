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
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/api/v1/namespaces/default/serviceaccounts', () =>
            HttpResponse.json({ kind: 'ServiceAccountList', items: [], metadata: {} })
          ),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => <Details name="my-service-account" namespace="default" />;
const MinimalTemplate: StoryFn = () => (
  <Details name="minimal-service-account" namespace="default" />
);

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/my-service-account',
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
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/my-service-account',
          () => HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[0])
        ),
      ],
    },
  },
};

export const NoSecrets = MinimalTemplate.bind({});
NoSecrets.decorators = [
  Story => (
    <TestContext routerMap={{ name: 'minimal-service-account', namespace: 'default' }}>
      <Story />
    </TestContext>
  ),
];
NoSecrets.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/minimal-service-account',
          () => HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[1])
        ),
      ],
    },
  },
};

export const AutomountDisabled = MinimalTemplate.bind({});
AutomountDisabled.decorators = [
  Story => (
    <TestContext routerMap={{ name: 'minimal-service-account', namespace: 'default' }}>
      <Story />
    </TestContext>
  ),
];
AutomountDisabled.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/minimal-service-account',
          () => HttpResponse.json(SERVICE_ACCOUNT_DUMMY_DATA[1])
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
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/serviceaccounts/my-service-account',
          () => HttpResponse.json({ message: 'Not found' }, { status: 404 })
        ),
      ],
    },
  },
};
