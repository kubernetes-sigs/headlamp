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
/** Service mock with full a8r.io annotations */
const serviceMockWithA8RAnnotations = {
  ...serviceMock,
  metadata: {
    ...serviceMock.metadata,
    name: 'a8r-annotated-service',
    annotations: {
      'a8r.io/owner': 'platform-team@example.com',
      'a8r.io/description': 'Main API gateway service for the platform',
      'a8r.io/documentation': 'https://docs.example.com/api-gateway',
      'a8r.io/repository': 'https://github.com/example/api-gateway',
      'a8r.io/bugs': 'https://github.com/example/api-gateway/issues',
      'a8r.io/chat': 'https://slack.example.com/channels/platform-team',
      'a8r.io/runbook': 'https://runbooks.example.com/api-gateway',
      'a8r.io/incidents': 'https://incidents.example.com/api-gateway',
      'a8r.io/uptime': 'https://status.example.com/api-gateway',
      'a8r.io/logs': 'https://logs.example.com/api-gateway',
      'a8r.io/dependencies': 'redis-master, auth-api, postgres-db',
    },
  },
};

/** Service mock with only a8r.io/owner annotation */
const serviceMockWithA8ROwnerOnly = {
  ...serviceMock,
  metadata: {
    ...serviceMock.metadata,
    name: 'owner-only-service',
    annotations: {
      'a8r.io/owner': 'backend-team@example.com',
    },
  },
};

const endpoints = [
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

const endpointslices = [
  {
    apiVersion: 'v1',
    kind: 'EndpointSlice',
    metadata: {
      name: 'example-service',
      namespace: 'default',
      resourceVersion: '78910',
      ownerReferences: [
        {
          kind: 'Service',
          name: 'example-service',
        },
      ],
    },
    endpoints: [
      {
        addresses: ['127.0.0.1'],
        nodeName: 'mynode',
        targetRef: {
          kind: 'Pod',
          namespace: 'MyNamespace',
          name: 'mypod',
          uid: 'phony-pod',
          resourceVersion: '1',
          apiVersion: 'v1',
        },
      },
      {
        addresses: ['127.0.0.2'],
        nodeName: 'mynode',
        targetRef: {
          kind: 'Pod',
          namespace: 'MyNamespace',
          name: 'mypod-1',
          uid: 'phony-pod-1',
          resourceVersion: '1',
          apiVersion: 'v1',
        },
      },
    ],
    ports: [
      {
        name: 'myport',
        port: 8080,
        protocol: 'TCP',
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
const TemplateA8R: StoryFn<typeof Details> = () => {
  return <Details name="a8r-annotated-service" namespace="default" />;
};

const TemplateA8ROwnerOnly: StoryFn<typeof Details> = () => {
  return <Details name="owner-only-service" namespace="default" />;
};

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services', () =>
          HttpResponse.error()
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services/example-service', () =>
          HttpResponse.json(serviceMock)
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/endpoints', () =>
          HttpResponse.json({
            kind: 'List',
            items: endpoints,
            metadata: {},
          })
        ),
        http.get(
          'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/default/endpointslices',
          () =>
            HttpResponse.json({
              kind: 'List',
              items: endpointslices,
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
        http.get('http://localhost:4466/api/v1/namespaces/default/services', () =>
          HttpResponse.error()
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services/example-service', () =>
          HttpResponse.json(serviceMock)
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/endpoints', () =>
          HttpResponse.error()
        ),
        http.get(
          'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/default/endpointslices',
          () => HttpResponse.error()
        ),
      ],
    },
  },
};

export const WithA8RAnnotations = TemplateA8R.bind({});
WithA8RAnnotations.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services', () =>
          HttpResponse.error()
        ),
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/services/a8r-annotated-service',
          () => HttpResponse.json(serviceMockWithA8RAnnotations)
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/endpoints', () =>
          HttpResponse.json({
            kind: 'List',
            items: endpoints,
            metadata: {},
          })
        ),
        http.get(
          'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/default/endpointslices',
          () =>
            HttpResponse.json({
              kind: 'List',
              items: endpointslices,
              metadata: {},
            })
        ),
      ],
    },
  },
};

/** Story showing a service with only a8r.io/owner annotation */
export const WithA8ROwnerOnly = TemplateA8ROwnerOnly.bind({});
WithA8ROwnerOnly.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/services', () =>
          HttpResponse.error()
        ),
        http.get(
          'http://localhost:4466/api/v1/namespaces/default/services/owner-only-service',
          () => HttpResponse.json(serviceMockWithA8ROwnerOnly)
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/endpoints', () =>
          HttpResponse.json({
            kind: 'List',
            items: endpoints,
            metadata: {},
          })
        ),
        http.get(
          'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/default/endpointslices',
          () =>
            HttpResponse.json({
              kind: 'List',
              items: endpointslices,
              metadata: {},
            })
        ),
      ],
    },
  },
};
