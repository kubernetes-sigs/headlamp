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
import { API_BASE, TestContext } from '../../test';
import List from './List';
import { NODE_DUMMY_DATA, NODE_DUMMY_DATA_NO_POOLS } from './storyHelper';

export default {
  title: 'node/List',
  component: List,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Story />
        </TestContext>
      );
    },
  ],
  parameters: {
    msw: {
      handlers: {
        story: [
          http.get(`${API_BASE}/api/v1/nodes`, () =>
            HttpResponse.json({
              kind: 'NodeList',
              apiVersion: 'v1',
              metadata: {},
              items: NODE_DUMMY_DATA,
            })
          ),
        ],
      },
    },
  },
} as Meta;

const Template: StoryFn = () => {
  return (
    <Container maxWidth="xl">
      <List />
    </Container>
  );
};

export const Nodes = Template.bind({});

export const NoNodePools: StoryFn = () => (
  <Container maxWidth="xl">
    <List />
  </Container>
);
NoNodePools.parameters = {
  msw: {
    handlers: {
      base: null,
      story: [
        http.get(`${API_BASE}/api/v1/nodes`, () =>
          HttpResponse.json({
            kind: 'NodeList',
            apiVersion: 'v1',
            metadata: {},
            items: NODE_DUMMY_DATA_NO_POOLS,
          })
        ),
        http.post(`${API_BASE}/apis/authorization.k8s.io/v1/selfsubjectaccessreviews`, () =>
          HttpResponse.json({ status: { allowed: true, reason: '', code: 200 } })
        ),
        http.get(`${API_BASE}/apis/metrics.k8s.io/v1beta1/nodes`, () =>
          HttpResponse.json({
            apiVersion: 'metrics.k8s.io/v1beta1',
            kind: 'NodeMetricsList',
            metadata: {},
            items: [],
          })
        ),
      ],
    },
  },
};
