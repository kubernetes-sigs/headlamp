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
import React from 'react';
import { TestContext } from '../../test';
import List from './List';

const items = [
  {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'example-service',
      namespace: 'default',
      creationTimestamp: '2022-10-25T11:48:48Z',
      uid: '12345',
    },
    spec: {
      type: 'ClusterIP',
      clusterIP: '10.96.0.100',
      externalIPs: ['34.123.45.67'],
      ports: [
        {
          protocol: 'TCP',
          port: 80,
          targetPort: 8080,
        },
      ],
      selector: {
        app: 'example',
      },
    },
    status: {
      loadBalancer: {
        ingress: [
          {
            ip: '34.123.45.67',
          },
        ],
      },
    },
  },
];
const serviceWithOwner = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: {
    name: 'owned-service',
    namespace: 'default',
    creationTimestamp: '2022-10-26T10:30:00Z',
    uid: '67890',
    annotations: {
      'a8r.io/owner': 'platform-team@example.com',
    },
  },
  spec: {
    type: 'ClusterIP',
    clusterIP: '10.96.0.101',
    ports: [
      {
        protocol: 'TCP',
        port: 443,
        targetPort: 8443,
      },
    ],
    selector: {
      app: 'owned-app',
    },
  },
  status: {},
};

export default {
  title: 'Service/List',
  component: List,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <List />;
};

export const Items = Template.bind({});
Items.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/services', () =>
          HttpResponse.json({
            kind: 'List',
            items,
            metadata: {},
          })
        ),
      ],
    },
  },
};
export const WithOwnerAnnotation = Template.bind({});
WithOwnerAnnotation.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/services', () =>
          HttpResponse.json({
            kind: 'List',
            items: [serviceWithOwner],
            metadata: {},
          })
        ),
      ],
    },
  },
};
