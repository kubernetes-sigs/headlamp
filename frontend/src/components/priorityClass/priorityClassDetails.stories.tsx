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
import HPADetails from './Details';

const mockItem = {
  description: 'Mission Critical apps.',
  kind: 'PriorityClass',
  metadata: {
    annotations: {
      'kubectl.kubernetes.io/last-applied-configuration':
        '{"apiVersion":"scheduling.k8s.io/v1","description":"Mission Critical apps.","globalDefault":false,"kind":"PriorityClass","metadata":{"annotations":{},"name":"high-priority-apps"},"preemptionPolicy":"PreemptLowerPriority","value":1000000}\n',
    },
    selfLink: '',
    creationTimestamp: '2022-10-26T13:46:17Z',
    generation: 1,
    name: 'high-priority-apps',
    resourceVersion: '6474045',
    uid: '4cfbe956-a997-4b58-8ea3-18655d0ba8a9',
  },
  preemptionPolicy: 'PreemptLowerPriority',
  value: 1000000,
};

export default {
  title: 'PriorityClass/PriorityClassDetailsView',
  component: HPADetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ namespace: 'my-namespace', name: 'my-endpoint' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get('http://localhost:4466/apis/scheduling.k8s.io/v1/priorityclasses', () =>
            HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;
const Template: StoryFn = () => {
  return <HPADetails />;
};

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/scheduling.k8s.io/v1/priorityclasses/my-endpoint',
          () => HttpResponse.json(mockItem)
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
          'http://localhost:4466/apis/scheduling.k8s.io/v1/priorityclasses/my-endpoint',
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
