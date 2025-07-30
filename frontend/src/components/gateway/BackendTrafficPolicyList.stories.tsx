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
import BackendTrafficPolicyList from './BackendTrafficPolicyList';
import { DEFAULT_BACKEND_TRAFFIC_POLICY } from './storyHelper';

export default {
  title: 'BackendTrafficPolicy/ListView',
  component: BackendTrafficPolicyList,
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
        storyBase: [],
        story: [
          http.get(
            'http://localhost:4466/apis/gateway.networking.x-k8s.io/v1alpha1/xbackendtrafficpolicies',
            () =>
              HttpResponse.json({
                kind: 'XBackendTrafficPolicyList',
                apiVersion: 'gateway.networking.x-k8s.io/v1alpha1',
                metadata: {},
                items: [DEFAULT_BACKEND_TRAFFIC_POLICY],
              })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <BackendTrafficPolicyList />;
};

export const Items = Template.bind({});
