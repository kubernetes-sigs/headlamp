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
import { delay, http, HttpResponse } from 'msw';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import Layout from './Layout';

export default {
  title: 'App/Layout',
  component: Layout,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The main layout component for Headlamp. It includes the top bar, sidebar, main content area, and handles cluster configuration and routing. This is the primary layout wrapper for the application.',
      },
    },
    msw: {
      handlers: [
        // Mock cluster config
        http.get('http://localhost:4466/config', () =>
          HttpResponse.json({
            clusters: {
              minikube: {
                name: 'minikube',
                meta_data: { namespace: 'default' },
              },
              production: {
                name: 'production',
                meta_data: { namespace: 'default' },
              },
            },
          })
        ),
        // Mock plugins
        http.get('http://localhost:4466/plugins', () => HttpResponse.json([])),
        // Mock cluster version
        http.get('http://localhost:4466/version', () =>
          HttpResponse.json({
            major: '1',
            minor: '28',
            gitVersion: 'v1.28.0',
          })
        ),
        // Mock events
        http.get('http://localhost:4466/*/api/v1/events', () =>
          HttpResponse.json({
            kind: 'EventList',
            items: [],
          })
        ),
        // Mock namespaces
        http.get('http://localhost:4466/*/api/v1/namespaces', () =>
          HttpResponse.json({
            kind: 'NamespaceList',
            items: [
              {
                metadata: { name: 'default', uid: '1' },
                spec: {},
                status: { phase: 'Active' },
              },
            ],
          })
        ),
        // Mock CRDs
        http.get(
          'http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
          () =>
            HttpResponse.json({
              kind: 'List',
              items: [],
              metadata: {},
            })
        ),
        http.get(
          'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
          () =>
            HttpResponse.json({
              kind: 'List',
              items: [],
              metadata: {},
            })
        ),
      ],
    },
  },
  decorators: [
    Story => (
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <TestContext>
            <Story />
          </TestContext>
        </MemoryRouter>
      </Provider>
    ),
  ],
} as Meta<typeof Layout>;

const Template: StoryFn = () => <Layout />;

export const Default = Template.bind({});
Default.parameters = {
  docs: {
    description: {
      story: 'The default layout with sidebar, topbar, and main content area.',
    },
  },
};

export const WithClusterRoute = Template.bind({});
WithClusterRoute.decorators = [
  Story => (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/c/minikube/pods']}>
        <TestContext routerMap={{ cluster: 'minikube' }}>
          <Story />
        </TestContext>
      </MemoryRouter>
    </Provider>
  ),
];
WithClusterRoute.parameters = {
  docs: {
    description: {
      story: 'Layout when viewing a specific cluster route (e.g., /c/minikube/pods).',
    },
  },
};

export const LoadingState = Template.bind({});
LoadingState.parameters = {
  docs: {
    description: {
      story: 'Layout showing loading state while fetching cluster configuration.',
    },
  },
  storyshots: {
    disable: true,
  },
  msw: {
    handlers: [
      // Delay config response to show loading for 5 seconds
      http.get('http://localhost:4466/config', async () => {
        await delay(5000);
        return HttpResponse.json({
          clusters: {
            minikube: {
              name: 'minikube',
              meta_data: { namespace: 'default' },
            },
          },
        });
      }),
      http.get('http://localhost:4466/plugins', () => HttpResponse.json([])),
      http.get('http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions', () =>
        HttpResponse.json({
          kind: 'List',
          items: [],
          metadata: {},
        })
      ),
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
        () =>
          HttpResponse.json({
            kind: 'List',
            items: [],
            metadata: {},
          })
      ),
    ],
  },
};

export const ErrorState = Template.bind({});
ErrorState.parameters = {
  docs: {
    description: {
      story: 'Layout showing error state when cluster configuration fails to load.',
    },
  },
  msw: {
    handlers: [
      http.get('http://localhost:4466/config', () => HttpResponse.error()),
      http.get('http://localhost:4466/plugins', () => HttpResponse.json([])),
      http.get('http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions', () =>
        HttpResponse.json({
          kind: 'List',
          items: [],
          metadata: {},
        })
      ),
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
        () =>
          HttpResponse.json({
            kind: 'List',
            items: [],
            metadata: {},
          })
      ),
    ],
  },
};

export const MultiCluster = Template.bind({});
MultiCluster.decorators = [
  Story => (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/c/minikube+production/pods']}>
        <TestContext routerMap={{ cluster: 'minikube+production' }}>
          <Story />
        </TestContext>
      </MemoryRouter>
    </Provider>
  ),
];
MultiCluster.parameters = {
  docs: {
    description: {
      story: 'Layout when viewing multiple clusters simultaneously.',
    },
  },
  msw: {
    handlers: [
      http.get('http://localhost:4466/config', () =>
        HttpResponse.json({
          clusters: {
            minikube: {
              name: 'minikube',
              meta_data: { namespace: 'default' },
            },
            production: {
              name: 'production',
              meta_data: { namespace: 'default' },
            },
            staging: {
              name: 'staging',
              meta_data: { namespace: 'default' },
            },
          },
        })
      ),
      http.get('http://localhost:4466/plugins', () => HttpResponse.json([])),
      http.get('http://localhost:4466/apis/apiextensions.k8s.io/v1/customresourcedefinitions', () =>
        HttpResponse.json({
          kind: 'List',
          items: [],
          metadata: {},
        })
      ),
      http.get(
        'http://localhost:4466/apis/apiextensions.k8s.io/v1beta1/customresourcedefinitions',
        () =>
          HttpResponse.json({
            kind: 'List',
            items: [],
            metadata: {},
          })
      ),
    ],
  },
};
