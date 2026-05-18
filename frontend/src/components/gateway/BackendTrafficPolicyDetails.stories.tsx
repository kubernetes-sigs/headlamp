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
import BackendTrafficPolicyDetails from './BackendTrafficPolicyDetails';
import { DEFAULT_BACKEND_TRAFFIC_POLICY } from './storyHelper';

export default {
  title: 'BackendTrafficPolicy/DetailsView',
  component: BackendTrafficPolicyDetails,
  decorators: [
    Story => (
      <TestContext routerMap={{ name: 'example-traffic-policy', namespace: 'default' }}>
        <Story />
      </TestContext>
    ),
  ],
  parameters: {
    msw: {
      handlers: {
        story: [],
        storyBase: [
          http.get(
            'http://localhost:4466/apis/gateway.networking.x-k8s.io/v1alpha1/namespaces/default/xbackendtrafficpolicies',
            () => HttpResponse.error()
          ),
          http.get(
            'http://localhost:4466/apis/gateway.networking.x-k8s.io/v1alpha1/namespaces/default/xbackendtrafficpolicies/example-traffic-policy',
            () => HttpResponse.json(DEFAULT_BACKEND_TRAFFIC_POLICY)
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
            () =>
              HttpResponse.json({
                status: { allowed: true, reason: '', code: 200 },
              })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <BackendTrafficPolicyDetails />;
};

export const Basic = Template.bind({});
