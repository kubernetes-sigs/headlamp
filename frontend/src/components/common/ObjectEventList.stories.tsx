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
import { getTestDate } from '../../helpers/testHelpers'; // For consistent dates
import { KubeEvent } from '../../lib/k8s/event';
import { KubeObject } from '../../lib/k8s/KubeObject';
import { TestContext } from '../../test'; // Adjust path
import ObjectEventList, { ObjectEventListProps } from './ObjectEventList';

const mockPod = new KubeObject({
  kind: 'Pod',
  apiVersion: 'v1',
  metadata: {
    name: 'my-test-pod',
    namespace: 'default',
    uid: 'pod-uid-123',
    creationTimestamp: getTestDate().toISOString(),
  },
}) as KubeObject; // Cast to base KubeObject for the prop

const mockService = new KubeObject({
  kind: 'Service',
  apiVersion: 'v1',
  metadata: {
    name: 'my-test-service',
    namespace: 'kube-system',
    uid: 'service-uid-456',
    creationTimestamp: getTestDate().toISOString(),
  },
}) as KubeObject;

const createMockEvent = (
  name: string,
  involvedObjectName: string,
  involvedObjectNamespace: string,
  involvedObjectKind: string,
  involvedObjectUID: string,
  type = 'Normal',
  reason = 'Created',
  message = 'Resource was created successfully',
  count = 1,
  lastTimestampOffsetMinutes = 0
): KubeEvent => {
  const lastTimestamp = new Date(getTestDate().getTime() - lastTimestampOffsetMinutes * 60 * 1000);
  return {
    kind: 'Event',
    apiVersion: 'v1',
    metadata: {
      name: `${name}-${Math.random().toString(36).substring(7)}`,
      namespace: involvedObjectNamespace,
      uid: `event-uid-${name}-${Math.random().toString(36).substring(7)}`,
      creationTimestamp: lastTimestamp.toISOString(),
    },
    involvedObject: {
      kind: involvedObjectKind,
      namespace: involvedObjectNamespace,
      name: involvedObjectName,
      uid: involvedObjectUID,
      apiVersion: 'v1', // Example, could vary
      resourceVersion: '1',
      fieldPath: '',
    },
    reason,
    message,
    source: { component: 'kubelet' },
    firstTimestamp: lastTimestamp.toISOString(),
    lastTimestamp: lastTimestamp.toISOString(),
    count,
    type,
  };
};

const mockEventsForPod: KubeEvent[] = [
  createMockEvent(
    'pod-event-1',
    mockPod.metadata.name,
    mockPod.metadata.namespace!,
    mockPod.kind,
    mockPod.metadata.uid,
    'Normal',
    'Scheduled',
    'Successfully assigned default/my-test-pod to minikube',
    1,
    5
  ),
  createMockEvent(
    'pod-event-2',
    mockPod.metadata.name,
    mockPod.metadata.namespace!,
    mockPod.kind,
    mockPod.metadata.uid,
    'Normal',
    'Pulled',
    'Container image "nginx:latest" already present on machine',
    1,
    4
  ),
  createMockEvent(
    'pod-event-3',
    mockPod.metadata.name,
    mockPod.metadata.namespace!,
    mockPod.kind,
    mockPod.metadata.uid,
    'Normal',
    'Created',
    'Created container main-container',
    1,
    3
  ),
  createMockEvent(
    'pod-event-4',
    mockPod.metadata.name,
    mockPod.metadata.namespace!,
    mockPod.kind,
    mockPod.metadata.uid,
    'Normal',
    'Started',
    'Started container main-container',
    1,
    2
  ),
  createMockEvent(
    'pod-event-5',
    mockPod.metadata.name,
    mockPod.metadata.namespace!,
    mockPod.kind,
    mockPod.metadata.uid,
    'Warning',
    'FailedScheduling',
    '0/1 nodes are available: 1 Insufficient cpu.',
    3,
    10
  ),
];

const mockEventsForService: KubeEvent[] = [
  createMockEvent(
    'service-event-1',
    mockService.metadata.name,
    mockService.metadata.namespace!,
    mockService.kind,
    mockService.metadata.uid,
    'Normal',
    'Updated',
    'Service updated successfully',
    1,
    10
  ),
];

export default {
  title: 'common/ObjectEventList',
  component: ObjectEventList,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: [
        // Default handler for pod events - can be overridden by specific stories
        http.get('/api/v1/namespaces/default/events', ({ request }) => {
          const url = new URL(request.url);
          const fieldSelector = url.searchParams.get('fieldSelector') || '';
          if (
            fieldSelector.includes(`involvedObject.name=${mockPod.metadata.name}`) &&
            fieldSelector.includes(`involvedObject.kind=${mockPod.kind}`)
          ) {
            return HttpResponse.json({
              kind: 'EventList',
              items: mockEventsForPod,
              metadata: {},
            });
          }
          return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
        }),
        // Default handler for service events
        http.get('/api/v1/namespaces/kube-system/events', ({ request }) => {
          const url = new URL(request.url);
          const fieldSelector = url.searchParams.get('fieldSelector') || '';
          if (
            fieldSelector.includes(`involvedObject.name=${mockService.metadata.name}`) &&
            fieldSelector.includes(`involvedObject.kind=${mockService.kind}`)
          ) {
            return HttpResponse.json({
              kind: 'EventList',
              items: mockEventsForService,
              metadata: {},
            });
          }
          return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
        }),
      ],
    },
  },
  argTypes: {
    object: {
      control: 'object',
      description: 'The KubeObject for which to display events.',
    },
  },
} as Meta<typeof ObjectEventList>;

const Template: StoryFn<ObjectEventListProps> = args => <ObjectEventList {...args} />;

export const ForPodWithEvents = Template.bind({});
ForPodWithEvents.args = {
  object: mockPod,
};

export const ForServiceWithEvents = Template.bind({});
ForServiceWithEvents.args = {
  object: mockService,
};

export const NoEvents = Template.bind({});
NoEvents.args = {
  object: new KubeObject({
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    metadata: {
      name: 'no-events-deployment',
      namespace: 'default',
      uid: 'dep-uid-789',
      creationTimestamp: getTestDate().toISOString(),
    },
  }) as KubeObject,
};
NoEvents.parameters = {
  msw: {
    handlers: [
      http.get('/api/v1/namespaces/default/events', ({ request }) => {
        const url = new URL(request.url);
        const fieldSelector = url.searchParams.get('fieldSelector') || '';
        if (fieldSelector.includes('involvedObject.name=no-events-deployment')) {
          return HttpResponse.json({ kind: 'EventList', items: [], metadata: {} });
        }
        // Fallback for other event requests if any, though this story focuses on no-events-deployment
        return HttpResponse.json({ kind: 'EventList', items: mockEventsForPod, metadata: {} });
      }),
    ],
  },
};

export const ErrorFetchingEvents = Template.bind({});
ErrorFetchingEvents.args = {
  object: new KubeObject({
    kind: 'ConfigMap',
    apiVersion: 'v1',
    metadata: {
      name: 'error-cm',
      namespace: 'test-ns',
      uid: 'cm-uid-err',
      creationTimestamp: getTestDate().toISOString(),
    },
  }) as KubeObject,
};
ErrorFetchingEvents.parameters = {
  msw: {
    handlers: [
      http.get('/api/v1/namespaces/test-ns/events', () => {
        return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 });
      }),
    ],
  },
};
