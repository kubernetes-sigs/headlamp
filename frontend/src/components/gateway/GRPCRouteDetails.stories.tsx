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
import GRPCRouteDetails from './GRPCRouteDetails';
import { DEFAULT_GRPC_ROUTE } from './storyHelper';

export default {
  title: 'GRPCRoute/DetailsView',
  component: GRPCRouteDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ name: 'default-grpcroute' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [],
        storyBase: [
          http.get('http://localhost:4466/apis/gateway.networking.k8s.io/v1/grpcroutes', () =>
            HttpResponse.json({})
          ),
          http.get('http://localhost:4466/apis/gateway.networking.k8s.io/v1beta1/grpcroutes', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/apis/gateway.networking.k8s.io/v1/grpcroutes', () =>
            HttpResponse.error()
          ),
          http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
          http.post(
            'http://localhost:4466/apis/authorization.k8s.io/v1/selfsubjectaccessreviews',
            () => HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <GRPCRouteDetails />;
};

export const Basic = Template.bind({});
Basic.args = {
  grpcRouteJson: DEFAULT_GRPC_ROUTE,
};
Basic.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/gateway.networking.k8s.io/v1/grpcroutes/default-grpcroute',
          () => HttpResponse.json(DEFAULT_GRPC_ROUTE)
        ),
      ],
    },
  },
};
