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
import { DEFAULT_UDP_ROUTE } from './storyHelper';
import UDPRouteList from './UDPRouteList';

const v1URL = `${API_BASE}/apis/gateway.networking.k8s.io/v1/udproutes`;
const v1alpha2URL = `${API_BASE}/apis/gateway.networking.k8s.io/v1alpha2/udproutes`;

export default {
  title: 'UDPRoute/ListView',
  component: UDPRouteList,
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
          http.get(v1URL, () =>
            HttpResponse.json({ kind: 'UDPRouteList', metadata: {}, items: [DEFAULT_UDP_ROUTE] })
          ),
          http.get(v1alpha2URL, () => HttpResponse.error()),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => <UDPRouteList />;

export const Items = Template.bind({});

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(v1URL, () => HttpResponse.json({ kind: 'UDPRouteList', metadata: {}, items: [] })),
        http.get(v1alpha2URL, () => HttpResponse.error()),
      ],
    },
  },
};

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(v1URL, () => new Promise(() => {})),
        http.get(v1alpha2URL, () => new Promise(() => {})),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(v1URL, () => HttpResponse.error()),
        http.get(v1alpha2URL, () => HttpResponse.error()),
      ],
    },
  },
};
