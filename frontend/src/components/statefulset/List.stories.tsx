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
import StatefulSetList from './List';

const mockStatefulSets = [
  {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: 'web',
      namespace: 'default',
      uid: '12345678-1234-1234-1234-123456789012',
      creationTimestamp: '2023-05-15T10:00:00Z',
    },
    spec: {
      replicas: 3,
      selector: {
        matchLabels: {
          app: 'web',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'web',
          },
        },
        spec: {
          containers: [
            {
              name: 'nginx',
              image: 'nginx:1.23',
            },
            {
              name: 'sidecar',
              image: 'sidecar:2.1',
            },
          ],
        },
      },
    },
    status: {
      replicas: 3,
      readyReplicas: 3,
      currentReplicas: 3,
      updatedReplicas: 3,
    },
  },
  {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: 'db',
      namespace: 'database',
      uid: '23456789-2345-2345-2345-234567890123',
      creationTimestamp: '2023-05-16T11:00:00Z',
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: 'database',
          tier: 'backend',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'database',
            tier: 'backend',
          },
        },
        spec: {
          containers: [
            {
              name: 'postgres',
              image: 'postgres:15',
            },
          ],
        },
      },
    },
    status: {
      replicas: 1,
      readyReplicas: 1,
      currentReplicas: 1,
      updatedReplicas: 1,
    },
  },
];

export default {
  title: 'StatefulSet/List',
  component: StatefulSetList,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('http://localhost:4466/apis/apps/v1/statefulsets', () => {
            return HttpResponse.json({
              kind: 'StatefulSetList',
              apiVersion: 'apps/v1',
              metadata: {
                resourceVersion: '12345',
              },
              items: mockStatefulSets,
            });
          }),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => <StatefulSetList />;

export const Default = Template.bind({});

export const EmptyList = Template.bind({});
EmptyList.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/apps/v1/statefulsets', () => {
          return HttpResponse.json({
            kind: 'StatefulSetList',
            apiVersion: 'apps/v1',
            metadata: {
              resourceVersion: '12345',
            },
            items: [],
          });
        }),
      ],
    },
  },
};

export const SingleItem = Template.bind({});
SingleItem.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/apps/v1/statefulsets', () => {
          return HttpResponse.json({
            kind: 'StatefulSetList',
            apiVersion: 'apps/v1',
            metadata: {
              resourceVersion: '12345',
            },
            items: [mockStatefulSets[0]],
          });
        }),
      ],
    },
  },
};

export const WithNotReadyReplicas = Template.bind({});
WithNotReadyReplicas.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/apis/apps/v1/statefulsets', () => {
          return HttpResponse.json({
            kind: 'StatefulSetList',
            apiVersion: 'apps/v1',
            metadata: {
              resourceVersion: '12345',
            },
            items: [
              {
                ...mockStatefulSets[0],
                status: {
                  replicas: 3,
                  readyReplicas: 1,
                  currentReplicas: 3,
                  updatedReplicas: 3,
                },
              },
            ],
          });
        }),
      ],
    },
  },
};
