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
import EndpointSliceDetails from './Details';

export default {
  title: 'endpointslice/EndpointSliceDetailsView',
  component: EndpointSliceDetails,
  argTypes: {},
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(
            'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/my-namespace/endpointslices',
            () => HttpResponse.error()
          ),
          http.get('http://localhost:4466/apis/discovery.k8s.io/v1/endpointslices', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/api/v1/namespaces/my-namespace/events', () =>
            HttpResponse.error()
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <TestContext routerMap={{ namespace: 'my-namespace', name: 'my-endpoint' }}>
      <EndpointSliceDetails />
    </TestContext>
  );
};

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/my-namespace/endpointslices/my-endpoint',
          () =>
            HttpResponse.json({
              kind: 'EndpointSlice',
              apiVersion: 'discovery.k8s.io/v1',
              metadata: {
                name: 'my-endpoint',
                namespace: 'my-namespace',
                uid: 'phony',
                creationTimestamp: new Date('2020-04-25').toISOString(),
                resourceVersion: '1',
                selfLink: '0',
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
            })
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
          'http://localhost:4466/apis/discovery.k8s.io/v1/namespaces/my-namespace/endpointslices/my-endpoint',
          () => HttpResponse.error()
        ),
      ],
    },
  },
};
