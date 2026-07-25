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

import Container from '@mui/material/Container';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import { TestContext } from '../../test';
import BindingList from './BindingList';
import { BASE_URL, CLUSTER_ROLE_BINDING_DUMMY_DATA, ROLE_BINDING_DUMMY_DATA } from './storyHelper';

export default {
  title: 'RoleBinding/List',
  component: BindingList,
  argTypes: {},
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn = () => (
  <Container maxWidth="xl">
    <BindingList />
  </Container>
);

export const RoleBindings = Template.bind({});
RoleBindings.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/rolebindings`, () =>
          HttpResponse.json({
            kind: 'RoleBindingList',
            items: ROLE_BINDING_DUMMY_DATA,
            metadata: {},
          })
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, () =>
          HttpResponse.json({
            kind: 'ClusterRoleBindingList',
            items: CLUSTER_ROLE_BINDING_DUMMY_DATA,
            metadata: {},
          })
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
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/rolebindings`, () =>
          HttpResponse.json({ kind: 'RoleBindingList', items: [], metadata: {} })
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, () =>
          HttpResponse.json({ kind: 'ClusterRoleBindingList', items: [], metadata: {} })
        ),
      ],
    },
  },
};

export const Error = Template.bind({});
Error.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/rolebindings`, () =>
          HttpResponse.error()
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`, () =>
          HttpResponse.error()
        ),
      ],
    },
  },
};
