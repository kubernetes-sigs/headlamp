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
import EndpointSliceList from './List';

const list = [
  {
    kind: 'EndpointSlice',
    apiVersion: 'discovery.k8s.io/v1',
    metadata: {
      namespace: '',
      creationTimestamp: new Date('2022-01-01').toISOString(),
    },
    endpoints: [
      {
        addresses: ['127.0.0.1'],
        nodeName: 'mynode',
        targetRef: {
          kind: 'Pod',
          namespace: 'my-namespace',
          name: 'mypod',
          uid: 'phony-pod',
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
  title: 'endpointslice/EndpointSliceListView',
  component: EndpointSliceList,
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
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get('http://localhost:4466/apis/discovery.k8s.io/v1/endpointslices', () =>
            HttpResponse.json({
              kind: 'EndpointSliceList',
              items: list,
              metadata: {},
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <EndpointSliceList />;
};

export const Items = Template.bind({});
