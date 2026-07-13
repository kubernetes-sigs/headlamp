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
import Details from './Details';
import { BASE_URL, CLUSTER_ROLE_DUMMY_DATA, ROLE_DUMMY_DATA } from './storyHelper';

const emptyEvents = { kind: 'EventList', items: [], metadata: {} };

export default {
  title: 'Role/DetailsView',
  component: Details,
  argTypes: {},
} as Meta;

const Template: StoryFn = () => <Details />;

// Namespaced Role: the component resolves to the Role resource type because a
// namespace is present in the route.
export const Role = Template.bind({});
Role.decorators = [
  Story => (
    <TestContext routerMap={{ namespace: 'default', name: 'pod-reader' }}>
      <Story />
    </TestContext>
  ),
];
Role.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${BASE_URL}/apis/rbac.authorization.k8s.io/v1/namespaces/default/roles/pod-reader`,
          () => HttpResponse.json(ROLE_DUMMY_DATA[0])
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/namespaces/default/roles`, () =>
          HttpResponse.json({ kind: 'RoleList', items: ROLE_DUMMY_DATA, metadata: {} })
        ),
        http.get(`${BASE_URL}/api/v1/namespaces/default/events`, () =>
          HttpResponse.json(emptyEvents)
        ),
      ],
    },
  },
};

// Cluster-scoped: with no namespace in the route the component resolves to the
// ClusterRole resource type.
export const ClusterRole = Template.bind({});
ClusterRole.decorators = [
  Story => (
    <TestContext routerMap={{ name: 'node-viewer' }}>
      <Story />
    </TestContext>
  ),
];
ClusterRole.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterroles/node-viewer`, () =>
          HttpResponse.json(CLUSTER_ROLE_DUMMY_DATA[0])
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterroles`, () =>
          HttpResponse.json({
            kind: 'ClusterRoleList',
            items: CLUSTER_ROLE_DUMMY_DATA,
            metadata: {},
          })
        ),
        http.get(`${BASE_URL}/api/v1/events`, () => HttpResponse.json(emptyEvents)),
      ],
    },
  },
};
