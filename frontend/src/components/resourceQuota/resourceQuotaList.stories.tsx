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
import ResourceQuotaList from './List';

const items = [
  {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      annotations: {
        'kubectl.kubernetes.io/last-applied-configuration':
          '{"apiVersion":"v1","kind":"ResourceQuota","metadata":{"annotations":{},"name":"test-cpu-quota","namespace":"test"},"spec":{"hard":{"limits.cpu":"300m","requests.cpu":"200m"}}}\n',
      },
      creationTimestamp: '2022-10-25T11:48:48Z',
      name: 'test-cpu-quota',
      namespace: 'test',
      resourceVersion: '6480949',
      uid: 'ebee95aa-f0a2-43d7-bd27-c7e756d0b163',
    },
    spec: {
      hard: {
        'limits.cpu': '300m',
        'requests.cpu': '200m',
      },
    },
    status: {
      hard: {
        'limits.cpu': '300m',
        'requests.cpu': '200m',
      },
      used: {
        'limits.cpu': '0',
        'requests.cpu': '500m',
      },
    },
  },
  {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      creationTimestamp: '2022-10-25T11:48:48Z',
      name: 'test-object-counts',
      namespace: 'test',
      resourceVersion: '6480950',
      uid: 'c02b62e8-3f30-4d5e-9c02-52d0d8b1a1f4',
    },
    spec: {
      hard: {
        'count/deployments.apps': '3',
        persistentvolumeclaims: '4',
        pods: '10',
        services: '5',
      },
    },
    status: {
      hard: {
        'count/deployments.apps': '3',
        persistentvolumeclaims: '4',
        pods: '10',
        services: '5',
      },
      used: {
        'count/deployments.apps': '1',
        persistentvolumeclaims: '0',
        pods: '2',
        services: '0',
      },
    },
  },
  {
    apiVersion: 'v1',
    kind: 'ResourceQuota',
    metadata: {
      creationTimestamp: '2022-10-25T11:48:48Z',
      name: 'test-mixed-quota',
      namespace: 'test',
      resourceVersion: '6480951',
      uid: 'a9d1c7b4-6e21-4a0f-8f3b-1b9f0e7c25da',
    },
    spec: {
      hard: {
        'limits.memory': '1Gi',
        pods: '8',
        'requests.cpu': '500m',
      },
    },
    status: {
      hard: {
        'limits.memory': '1Gi',
        pods: '8',
        'requests.cpu': '500m',
      },
      used: {
        'limits.memory': '0',
        pods: '3',
        'requests.cpu': '100m',
      },
    },
  },
];

export default {
  title: 'ResourceQuota/ResourceQuotaListView',
  component: ResourceQuotaList,
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
  return <ResourceQuotaList />;
};

export const Items = Template.bind({});
Items.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/resourcequotas`, () =>
          HttpResponse.json({
            kind: 'ResourceQuotaList',
            items,
            metadata: {},
          })
        ),
      ],
    },
  },
};
