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
import Details from './Details';

const serviceMock = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: {
    name: 'example-service',
    namespace: 'default',
    resourceVersion: '12346',
    creationTimestamp: '2022-10-25T11:48:48Z',
    uid: '12345',
  },
  spec: {
    type: 'ClusterIP',
    resourceVersion: '12346',
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
};

const list = [
  {
    apiVersion: 'v1',
    kind: 'Endpoints',
    metadata: {
      name: 'example-service',
      namespace: 'default',
      resourceVersion: '78910',
    },
    subsets: [
      {
        addresses: [{ ip: '192.168.1.1' }],
        ports: [{ port: 8080 }],
      },
    ],
  },
];

export default {
  title: 'Service/Details',
  component: Details,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta<typeof Details>;

const Template: StoryFn<typeof Details> = () => {
  return <Details name="example-service" namespace="default" />;
};

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services/example-service', () =>
          HttpResponse.json(serviceMock)
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/endpoints', () =>
          HttpResponse.json({
            kind: 'List',
            items: list,
            metadata: {},
          })
        ),
      ],
    },
  },
};

export const ErrorWithEndpoints = Template.bind({});
ErrorWithEndpoints.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services/example-service', () =>
          HttpResponse.json(serviceMock)
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/endpoints', () =>
          HttpResponse.error()
        ),
      ],
    },
  },
};
