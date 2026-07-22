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
import type { KubeNamespace } from '../../lib/k8s/namespace';
import { API_BASE, TestContext } from '../../test';
import NamespacesList from './List';

const items: KubeNamespace[] = [
  {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: 'default',
      creationTimestamp: '2024-01-01T00:00:00Z',
      uid: 'ns-001',
    },
    status: {
      phase: 'Active',
    },
  },
  {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: 'terminating-ns',
      creationTimestamp: '2024-01-02T00:00:00Z',
      uid: 'ns-002',
    },
    status: {
      phase: 'Terminating',
    },
  },
];

export default {
  title: 'Namespace/ListView',
  component: NamespacesList,
  argTypes: {},
  decorators: [
    Story => {
      return (
        <TestContext>
          <Container maxWidth="xl">
            <Story />
          </Container>
        </TestContext>
      );
    },
  ],
} as Meta;

const Template: StoryFn = () => {
  return <NamespacesList />;
};

export const Regular = Template.bind({});
Regular.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces`, () =>
          HttpResponse.json({
            kind: 'NamespaceList',
            items,
            metadata: {},
          })
        ),
      ],
    },
  },
};

const noStatusItems: Partial<KubeNamespace>[] = [
  {
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: 'no-status-ns',
      creationTimestamp: '2024-01-01T00:00:00Z',
      uid: 'ns-003',
    },
  },
];

export const NoStatus = Template.bind({});
NoStatus.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces`, () =>
          HttpResponse.json({
            kind: 'NamespaceList',
            items: noStatusItems,
            metadata: {},
          })
        ),
      ],
    },
  },
};
