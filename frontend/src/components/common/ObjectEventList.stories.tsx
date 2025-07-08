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
import { Provider } from 'react-redux';
import { getTestDate } from '../../helpers/testHelpers';
import { KubeEvent } from '../../lib/k8s/event';
import { KubeObject } from '../../lib/k8s/KubeObject';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import ObjectEventList, { ObjectEventListProps } from './ObjectEventList';

const mockOwnerObject = new KubeObject({
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'test-pod-for-events',
    namespace: 'default',
    uid: 'owner-pod-uid-123',
    creationTimestamp: getTestDate().toISOString(),
  },
});

const mockOwnerObjectNoEvents = new KubeObject({
  kind: 'Deployment',
  apiVersion: 'apps/v1',
  metadata: {
    name: 'test-deployment-no-events',
    namespace: 'kube-system',
    uid: 'owner-deployment-uid-456',
    creationTimestamp: getTestDate().toISOString(),
  },
});

const mockEvents: KubeEvent[] = [
  {
    kind: 'Event',
    apiVersion: 'v1',
    metadata: {
      name: 'event1.123',
      namespace: 'default',
      uid: 'event-uid-1',
      creationTimestamp: new Date(getTestDate().getTime() - 5 * 60 * 1000).toISOString(),
    },
    involvedObject: {
      kind: 'Pod',
      namespace: 'default',
      name: 'test-pod-for-events',
      uid: 'owner-pod-uid-123',
      apiVersion: 'v1',
      resourceVersion: '1',
      fieldPath: '',
    },
    reason: 'Scheduled',
    message: 'Successfully assigned default/test-pod-for-events to worker-node-1',
    source: { component: 'default-scheduler' },
    firstTimestamp: new Date(getTestDate().getTime() - 5 * 60 * 1000).toISOString(),
    lastTimestamp: new Date(getTestDate().getTime() - 5 * 60 * 1000).toISOString(),
    count: 1,
    type: 'Normal',
  },
  {
    kind: 'Event',
    apiVersion: 'v1',
    metadata: {
      name: 'event2.456',
      namespace: 'default',
      uid: 'event-uid-2',
      creationTimestamp: new Date(getTestDate().getTime() - 2 * 60 * 1000).toISOString(),
    },
    involvedObject: {
      kind: 'Pod',
      namespace: 'default',
      name: 'test-pod-for-events',
      uid: 'owner-pod-uid-123',
      apiVersion: 'v1',
      resourceVersion: '1',
      fieldPath: '',
    },
    reason: 'Pulled',
    message: 'Container image "nginx:latest" already present on machine',
    source: { component: 'kubelet' },
    firstTimestamp: new Date(getTestDate().getTime() - 2 * 60 * 1000).toISOString(),
    lastTimestamp: new Date(getTestDate().getTime() - 2 * 60 * 1000).toISOString(),
    count: 1,
    type: 'Normal',
  },
];

export default {
  title: 'common/ObjectEventList',
  component: ObjectEventList,
  decorators: [
    Story => (
      <Provider store={store}>
        <TestContext>
          <Story />
        </TestContext>
      </Provider>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get(
            'http://localhost:4466/api/v1/namespaces/:namespace/events',
            ({ params, request }) => {
              const url = new URL(request.url);
              const fieldSelector = url.searchParams.get('fieldSelector');
              const reqNamespace = params.namespace;

              if (
                reqNamespace === mockOwnerObject.metadata.namespace &&
                fieldSelector &&
                fieldSelector.includes(`involvedObject.kind=${mockOwnerObject.kind}`) &&
                fieldSelector.includes(`involvedObject.name=${mockOwnerObject.metadata.name}`)
              ) {
                return HttpResponse.json({
                  kind: 'EventList',
                  items: mockEvents,
                  metadata: {},
                });
              }
              if (
                reqNamespace === mockOwnerObjectNoEvents.metadata.namespace &&
                fieldSelector &&
                fieldSelector.includes(`involvedObject.kind=${mockOwnerObjectNoEvents.kind}`) &&
                fieldSelector.includes(
                  `involvedObject.name=${mockOwnerObjectNoEvents.metadata.name}`
                )
              ) {
                return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
              }
              return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
            }
          ),
        ],
      },
    },
  },
  argTypes: {
    object: {
      control: false,
      description: 'The KubeObject for which to display events.',
    },
  },
} as Meta<typeof ObjectEventList>;

const Template: StoryFn<ObjectEventListProps> = args => <ObjectEventList {...args} />;

export const WithEvents = Template.bind({});
WithEvents.args = {
  object: mockOwnerObject,
};
WithEvents.storyName = 'Displaying Events for an Object';

export const NoEventsForObject = Template.bind({});
NoEventsForObject.args = {
  object: mockOwnerObjectNoEvents,
};
NoEventsForObject.storyName = 'No Events for an Object';

export const ErrorFetching = Template.bind({});
ErrorFetching.args = {
  object: new KubeObject({
    kind: 'Secret',
    apiVersion: 'v1',
    metadata: {
      name: 'error-secret',
      namespace: 'errors',
      uid: 'secret-err-uid',
      creationTimestamp: getTestDate().toISOString(),
    },
  }),
};
ErrorFetching.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () => {
          return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
        }),
        http.get('http://localhost:4466/api/v1/namespaces/errors/events', ({ request }) => {
          const url = new URL(request.url);
          const fieldSelector = url.searchParams.get('fieldSelector');
          if (fieldSelector && fieldSelector.includes('involvedObject.name=error-secret')) {
            return HttpResponse.json(
              { message: 'Simulated server error fetching events' },
              { status: 500 }
            );
          }
          return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
        }),
      ],
    },
  },
};
ErrorFetching.storyName = 'Error Fetching Events';
