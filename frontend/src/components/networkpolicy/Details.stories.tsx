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
import { NetworkPolicyDetails } from './Details';
import { NETWORK_POLICY_DETAIL, NETWORK_POLICY_ITEMS } from './storyHelper';

export default {
  title: 'NetworkPolicy/DetailsView',
  component: NetworkPolicyDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ namespace: 'default', name: 'allow-frontend-traffic' }}>
          <Story />
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <NetworkPolicyDetails />;
};

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          'http://localhost:4466/apis/networking.k8s.io/v1/namespaces/default/networkpolicies/allow-frontend-traffic',
          () => HttpResponse.json(NETWORK_POLICY_DETAIL)
        ),
        http.get('http://localhost:4466/apis/networking.k8s.io/v1/networkpolicies', () =>
          HttpResponse.json({
            kind: 'NetworkPolicyList',
            items: NETWORK_POLICY_ITEMS,
            metadata: {},
          })
        ),
        http.get('http://localhost:4466/api/v1/namespaces/default/events', () =>
          HttpResponse.json({
            kind: 'EventList',
            items: [],
            metadata: {},
          })
        ),
      ],
    },
  },
};
