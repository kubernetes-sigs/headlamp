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
import ServiceAccountDetails from './Details';
import { BASE_EMPTY_SERVICE_ACCOUNT, BASE_SERVICE_ACCOUNT } from './storyHelper';

const demoRoleBinding = {
  kind: 'RoleBinding',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  metadata: {
    name: 'demo-rb',
    namespace: 'default',
    uid: 'rb-demo-uid',
    resourceVersion: '2',
    creationTimestamp: '2026-06-14T14:31:50Z',
  },
  roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'demo-role' },
  subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }],
};

// Lives in a different namespace from the ServiceAccount it targets — valid Kubernetes RBAC
// (a RoleBinding's own namespace need not match its subjects' namespaces) — and must still be
// found, since the list is fetched cluster-wide rather than scoped to the SA's own namespace.
const demoRoleBindingFromOtherNamespace = {
  kind: 'RoleBinding',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  metadata: {
    name: 'demo-rb-cross-namespace',
    namespace: 'other-ns',
    uid: 'rb-demo-cross-ns-uid',
    resourceVersion: '6',
    creationTimestamp: '2026-06-14T14:31:50Z',
  },
  roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'cross-namespace-role' },
  subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }],
};

// References a different ServiceAccount; should be filtered out of the section.
const unrelatedRoleBinding = {
  kind: 'RoleBinding',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  metadata: {
    name: 'other-rb',
    namespace: 'default',
    uid: 'rb-other-uid',
    resourceVersion: '3',
    creationTimestamp: '2026-06-14T14:31:50Z',
  },
  roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'other-role' },
  subjects: [{ kind: 'ServiceAccount', name: 'other', namespace: 'default' }],
};

// A namespaced RoleBinding referencing a cluster-scoped ClusterRole (valid Kubernetes RBAC:
// a RoleBinding may bind either a Role or a ClusterRole). The role link must omit the
// binding's namespace, or it resolves as a namespaced Role instead of a ClusterRole.
const demoRoleBindingToClusterRole = {
  kind: 'RoleBinding',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  metadata: {
    name: 'demo-rb-shared-role',
    namespace: 'default',
    uid: 'rb-demo-shared-uid',
    resourceVersion: '5',
    creationTimestamp: '2026-06-14T14:31:50Z',
  },
  roleRef: {
    apiGroup: 'rbac.authorization.k8s.io',
    kind: 'ClusterRole',
    name: 'demo-shared-clusterrole',
  },
  subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }],
};

const demoClusterRoleBinding = {
  kind: 'ClusterRoleBinding',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  metadata: {
    name: 'demo-crb',
    uid: 'crb-demo-uid',
    resourceVersion: '4',
    creationTimestamp: '2026-06-14T14:31:50Z',
  },
  roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'demo-clusterrole' },
  subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }],
};

const SA_LIST_URL = `${API_BASE}/api/v1/namespaces/default/serviceaccounts`;
const SA_URL = `${API_BASE}/api/v1/namespaces/default/serviceaccounts/my-sa`;
// Fetched cluster-wide (no namespace segment) — see the comment on RoleBinding.useList in Details.tsx.
const ROLE_BINDINGS_URL = `${API_BASE}/apis/rbac.authorization.k8s.io/v1/rolebindings`;
const CLUSTER_ROLE_BINDINGS_URL = `${API_BASE}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`;

const EMPTY_ROLE_BINDING_LIST = {
  kind: 'RoleBindingList',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  items: [],
  metadata: {},
};
const EMPTY_CLUSTER_ROLE_BINDING_LIST = {
  kind: 'ClusterRoleBindingList',
  apiVersion: 'rbac.authorization.k8s.io/v1',
  items: [],
  metadata: {},
};

export default {
  title: 'ServiceAccount/DetailsView',
  component: ServiceAccountDetails,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext routerMap={{ namespace: 'default', name: 'my-sa' }}>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        storyBase: [
          http.get(`${API_BASE}/api/v1/namespaces/default/events`, () =>
            HttpResponse.json({
              kind: 'EventList',
              items: [],
              metadata: {},
            })
          ),
          // Only the shared events handler lives here. The ServiceAccount, RoleBinding and
          // ClusterRoleBinding handlers are defined per-story so that each story's own data takes
          // effect — msw-storybook-addon concatenates storyBase handlers before story handlers and
          // MSW resolves the first match, so a storyBase handler for the same URL would always win
          // over a story override.
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return <ServiceAccountDetails />;
};

export const WithBase = Template.bind({});
WithBase.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(SA_LIST_URL, () =>
          HttpResponse.json({
            kind: 'ServiceAccountList',
            apiVersion: 'v1',
            items: [BASE_SERVICE_ACCOUNT],
            metadata: {},
          })
        ),
        http.get(SA_URL, () => HttpResponse.json(BASE_SERVICE_ACCOUNT)),
        http.get(ROLE_BINDINGS_URL, () => HttpResponse.json(EMPTY_ROLE_BINDING_LIST)),
        http.get(CLUSTER_ROLE_BINDINGS_URL, () =>
          HttpResponse.json(EMPTY_CLUSTER_ROLE_BINDING_LIST)
        ),
      ],
    },
  },
};

export const Empty = Template.bind({});
Empty.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(SA_LIST_URL, () =>
          HttpResponse.json({
            kind: 'ServiceAccountList',
            apiVersion: 'v1',
            items: [BASE_EMPTY_SERVICE_ACCOUNT],
            metadata: {},
          })
        ),
        http.get(SA_URL, () => HttpResponse.json(BASE_EMPTY_SERVICE_ACCOUNT)),
        http.get(ROLE_BINDINGS_URL, () => HttpResponse.json(EMPTY_ROLE_BINDING_LIST)),
        http.get(CLUSTER_ROLE_BINDINGS_URL, () =>
          HttpResponse.json(EMPTY_CLUSTER_ROLE_BINDING_LIST)
        ),
      ],
    },
  },
};

export const WithBindings = Template.bind({});
WithBindings.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(SA_LIST_URL, () =>
          HttpResponse.json({
            kind: 'ServiceAccountList',
            apiVersion: 'v1',
            items: [BASE_SERVICE_ACCOUNT],
            metadata: {},
          })
        ),
        http.get(SA_URL, () => HttpResponse.json(BASE_SERVICE_ACCOUNT)),
        http.get(ROLE_BINDINGS_URL, () =>
          HttpResponse.json({
            kind: 'RoleBindingList',
            apiVersion: 'rbac.authorization.k8s.io/v1',
            items: [
              demoRoleBinding,
              demoRoleBindingToClusterRole,
              demoRoleBindingFromOtherNamespace,
              unrelatedRoleBinding,
            ],
            metadata: {},
          })
        ),
        http.get(CLUSTER_ROLE_BINDINGS_URL, () =>
          HttpResponse.json({
            kind: 'ClusterRoleBindingList',
            apiVersion: 'rbac.authorization.k8s.io/v1',
            items: [demoClusterRoleBinding],
            metadata: {},
          })
        ),
      ],
    },
  },
};

// Both binding lists fail (e.g. the user lacks permission to list bindings), so the section
// renders its explicit "Unable to list…" error state rather than the empty message.
export const ListError = Template.bind({});
ListError.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(SA_LIST_URL, () =>
          HttpResponse.json({
            kind: 'ServiceAccountList',
            apiVersion: 'v1',
            items: [BASE_SERVICE_ACCOUNT],
            metadata: {},
          })
        ),
        http.get(SA_URL, () => HttpResponse.json(BASE_SERVICE_ACCOUNT)),
        http.get(ROLE_BINDINGS_URL, () => HttpResponse.error()),
        http.get(CLUSTER_ROLE_BINDINGS_URL, () => HttpResponse.error()),
      ],
    },
  },
};
