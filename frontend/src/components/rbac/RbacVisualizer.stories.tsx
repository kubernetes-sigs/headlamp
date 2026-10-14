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
import {
  BASE_URL,
  CLUSTER_ROLE_BINDING_DUMMY_DATA,
  CLUSTER_ROLE_DUMMY_DATA,
  ROLE_BINDING_DUMMY_DATA,
  ROLE_DUMMY_DATA,
} from '../role/storyHelper';
import RbacVisualizer from './RbacVisualizer';

export default {
  title: 'RBAC/Visualizer',
  component: RbacVisualizer,
  decorators: [
    Story => (
      <TestContext>
        <Story />
      </TestContext>
    ),
  ],
} as Meta;

const Template: StoryFn = () => (
  <Container maxWidth="xl" sx={{ height: '80vh', p: 2 }}>
    <RbacVisualizer />
  </Container>
);

export const Default = Template.bind({});
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${BASE_URL}/api/v1/serviceaccounts`, () =>
          HttpResponse.json({
            kind: 'ServiceAccountList',
            items: [
              {
                apiVersion: 'v1',
                kind: 'ServiceAccount',
                metadata: { name: 'default', namespace: 'default' },
              },
              {
                apiVersion: 'v1',
                kind: 'ServiceAccount',
                metadata: { name: 'deployer', namespace: 'default' },
              },
            ],
            metadata: {},
          })
        ),
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
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/roles`, () =>
          HttpResponse.json({
            kind: 'RoleList',
            items: ROLE_DUMMY_DATA,
            metadata: {},
          })
        ),
        http.get(`${BASE_URL}/apis/rbac.authorization.k8s.io/v1/clusterroles`, () =>
          HttpResponse.json({
            kind: 'ClusterRoleList',
            items: CLUSTER_ROLE_DUMMY_DATA,
            metadata: {},
          })
        ),
      ],
    },
  },
};
