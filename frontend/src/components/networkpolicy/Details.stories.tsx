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
import type { KubeNetworkPolicy } from '../../lib/k8s/networkpolicy';
import { API_BASE, TestContext } from '../../test';
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

const detailsUrl = `${API_BASE}/apis/networking.k8s.io/v1/namespaces/default/networkpolicies/allow-frontend-traffic`;
const commonHandlers = [
  http.get(`${API_BASE}/apis/networking.k8s.io/v1/namespaces/default/networkpolicies`, () =>
    HttpResponse.json({ kind: 'NetworkPolicyList', items: NETWORK_POLICY_ITEMS, metadata: {} })
  ),
  http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
    HttpResponse.json({ kind: 'EventList', items: [], metadata: {} })
  ),
];

function policyParameters(policy: KubeNetworkPolicy) {
  return {
    msw: {
      handlers: {
        story: [http.get(detailsUrl, () => HttpResponse.json(policy)), ...commonHandlers],
      },
    },
  };
}

export const Default = Template.bind({});
Default.parameters = policyParameters(NETWORK_POLICY_DETAIL);

export const CombinedPeers = Template.bind({});
CombinedPeers.parameters = policyParameters({
  ...NETWORK_POLICY_DETAIL,
  spec: {
    ...NETWORK_POLICY_DETAIL.spec,
    ingress: [
      {
        ports: NETWORK_POLICY_DETAIL.spec.ingress[0].ports,
        from: [
          {
            namespaceSelector: { matchLabels: { environment: 'production' } },
            podSelector: { matchLabels: { app: 'backend' } },
          },
        ],
      },
    ],
    egress: [
      {
        ports: NETWORK_POLICY_DETAIL.spec.egress[0].ports,
        to: [
          {
            namespaceSelector: { matchLabels: { environment: 'shared' } },
            podSelector: { matchLabels: { role: 'dns' } },
          },
        ],
      },
    ],
  },
});

export const Loading = Template.bind({});
Loading.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [http.get(detailsUrl, () => new Promise(() => {})), ...commonHandlers],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(detailsUrl, () =>
          HttpResponse.json({ message: 'Access denied' }, { status: 403 })
        ),
        ...commonHandlers,
      ],
    },
  },
};
