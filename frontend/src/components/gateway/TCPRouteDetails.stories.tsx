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
import { DEFAULT_TCP_ROUTE, EMPTY_TCP_ROUTE } from './storyHelper';
import TCPRouteDetails from './TCPRouteDetails';

const collectionURLs = [
  `${API_BASE}/apis/gateway.networking.k8s.io/v1/tcproutes`,
  `${API_BASE}/apis/gateway.networking.k8s.io/v1alpha2/tcproutes`,
];
const watchURLs = [
  `${API_BASE}/apis/gateway.networking.k8s.io/v1/namespaces/default/tcproutes`,
  `${API_BASE}/apis/gateway.networking.k8s.io/v1alpha2/namespaces/default/tcproutes`,
];
const detailsURLs = watchURLs.map(url => `${url}/default-tcproute`);

export default {
  title: 'TCPRoute/DetailsView',
  component: TCPRouteDetails,
  decorators: [
    Story => (
      <TestContext routerMap={{ namespace: 'default', name: 'default-tcproute' }}>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          ...collectionURLs.map(url =>
            http.get(url, () =>
              HttpResponse.json({ kind: 'TCPRouteList', metadata: {}, items: [] })
            )
          ),
          http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
            HttpResponse.json({ kind: 'EventList', metadata: {}, items: [] })
          ),
          http.post(`${API_BASE}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`, () =>
            HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
        ],
        story: [
          http.get(watchURLs[0], () =>
            HttpResponse.json({ kind: 'TCPRouteList', metadata: {}, items: [DEFAULT_TCP_ROUTE] })
          ),
          http.get(watchURLs[1], () => HttpResponse.error()),
          http.get(detailsURLs[0], () => HttpResponse.json(DEFAULT_TCP_ROUTE)),
          http.get(detailsURLs[1], () => HttpResponse.error()),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => <TCPRouteDetails />;

export const Basic = Template.bind({});

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(watchURLs[0], () =>
          HttpResponse.json({ kind: 'TCPRouteList', metadata: {}, items: [EMPTY_TCP_ROUTE] })
        ),
        http.get(watchURLs[1], () => HttpResponse.error()),
        http.get(detailsURLs[0], () => HttpResponse.json(EMPTY_TCP_ROUTE)),
        http.get(detailsURLs[1], () => HttpResponse.error()),
      ],
    },
  },
};

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [...watchURLs, ...detailsURLs].map(url => http.get(url, () => new Promise(() => {}))),
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [...watchURLs, ...detailsURLs].map(url => http.get(url, () => HttpResponse.error())),
    },
  },
};
