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
import BindingDetails from './BindingDetails';
import { BASE_URL, CLUSTER_ROLE_BINDING_DUMMY_DATA, ROLE_BINDING_DUMMY_DATA } from './storyHelper';

const emptyEvents = { kind: 'EventList', items: [], metadata: {} };

export default {
  title: 'RoleBinding/DetailsView',
  component: BindingDetails,
  argTypes: {},
} as Meta;

const Template: StoryFn = () => <BindingDetails />;

// Namespaced RoleBinding: the component resolves to the RoleBinding resource
// type because a namespace is present in the route.
export const RoleBinding = Template.bind({});
RoleBinding.decorators = [
  Story => (
    <TestContext routerMap={{ namespace: 'default', name: 'read-pods' }}>
      <Story />
    </TestContext>
  ),
];
RoleBinding.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${BASE_URL}/apis/rbac.authorization.k8s.io/v1/namespaces/default/rolebindings/read-pods`,
          () => HttpResponse.json(ROLE_BINDING_DUMMY_DATA[0])
        ),
        http.get(
          `${BASE_URL}/apis/rbac.authorization.k8s.io/v1/namespaces/default/rolebindings`,
          () =>
            HttpResponse.json({
              kind: 'RoleBindingList',
              items: ROLE_BINDING_DUMMY_DATA,
              metadata: {},
            })
        ),
        http.get(`${BASE_URL}/api/v1/namespaces/default/events`, () =>
          HttpResponse.json(emptyEvents)
        ),
      ],
    },
  },
};

// Cluster-scoped: with no namespace in the route the component resolves to the
// ClusterRoleBinding resource type.
export const ClusterRoleBinding = Template.bind({});
ClusterRoleBinding.decorators = [
  Story => (
    <TestContext routerMap={{ name: 'view-nodes' }}>
      <Story />
    </TestContext>
  ),
];
ClusterRoleBinding.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(
          `${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings/view-nodes`,
          () => HttpResponse.json(CLUSTER_ROLE_BINDING_DUMMY_DATA[0])
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, () =>
          HttpResponse.json({
            kind: 'ClusterRoleBindingList',
            items: CLUSTER_ROLE_BINDING_DUMMY_DATA,
            metadata: {},
          })
        ),
        http.get(`${BASE_URL}/api/v1/events`, () => HttpResponse.json(emptyEvents)),
      ],
    },
  },
};
