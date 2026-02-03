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

import { configureStore } from '@reduxjs/toolkit';
import { Meta, StoryFn } from '@storybook/react';
import { http, HttpResponse } from 'msw';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import { CreateNew } from './ProjectCreateFromYaml';
import { PROJECT_ID_LABEL } from './projectUtils';

export default {
  title: 'project/CreateFromYaml',
  component: CreateNew,
  argTypes: {},
  decorators: [Story => <Story />],
} as Meta;

const makeStore = () => {
  return configureStore({
    reducer: reducers,
    preloadedState: {
      config: {
        clusters: null,
        statelessClusters: null,
        allClusters: {
          'cluster-a': { name: 'cluster-a' },
          'cluster-b': { name: 'cluster-b' },
        } as any,
        settings: {
          tableRowsPerPageOptions: [15, 25, 50],
          timezone: 'UTC',
          useEvict: true,
        },
      },
      projects: {
        headerActions: {},
        customCreateProject: {},
        detailsTabs: {},
        overviewSections: {},
      },
    },
  });
};

const Template: StoryFn<{ store: ReturnType<typeof configureStore> }> = args => {
  const { store } = args;
  return (
    <TestContext store={store}>
      <div style={{ height: 800 }}>
        <CreateNew />
      </div>
    </TestContext>
  );
};

export const Default = Template.bind({});
Default.args = {
  store: makeStore(),
};

// Optional MSW handlers to satisfy apiDiscovery when a cluster is selected
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces', () =>
          HttpResponse.json({
            kind: 'NamespaceList',
            items: [],
            metadata: {},
          })
        ),
        http.get('http://localhost:4466/clusters/cluster-a/api', () =>
          HttpResponse.json({ versions: ['v1'] })
        ),
        http.get('http://localhost:4466/clusters/cluster-a/apis', () =>
          HttpResponse.json({ groups: [] })
        ),
        http.get('http://localhost:4466/clusters/cluster-a/api/v1', () =>
          HttpResponse.json({
            resources: [
              { name: 'pods', singularName: 'pod', namespaced: true, kind: 'Pod', verbs: ['list'] },
              {
                name: 'configmaps',
                singularName: 'configmap',
                namespaced: true,
                kind: 'ConfigMap',
                verbs: ['list'],
              },
            ],
          })
        ),
      ],
    },
  },
};

export const WithExistingProjects = Template.bind({});
WithExistingProjects.args = {
  store: makeStore(),
};
WithExistingProjects.parameters = {
  msw: {
    handlers: {
      story: [
        http.get('http://localhost:4466/api/v1/namespaces', () =>
          HttpResponse.json({
            kind: 'NamespaceList',
            items: [
              {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                  name: 'existing-project',
                  uid: 'ns-1',
                  labels: {
                    [PROJECT_ID_LABEL]: 'existing-project',
                  },
                },
              },
              {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                  name: 'my-app',
                  uid: 'ns-2',
                  labels: {
                    [PROJECT_ID_LABEL]: 'my-app',
                  },
                },
              },
            ],
            metadata: {},
          })
        ),
        http.get('http://localhost:4466/clusters/cluster-a/api', () =>
          HttpResponse.json({ versions: ['v1'] })
        ),
        http.get('http://localhost:4466/clusters/cluster-a/apis', () =>
          HttpResponse.json({ groups: [] })
        ),
        http.get('http://localhost:4466/clusters/cluster-a/api/v1', () =>
          HttpResponse.json({
            resources: [
              { name: 'pods', singularName: 'pod', namespaced: true, kind: 'Pod', verbs: ['list'] },
              {
                name: 'configmaps',
                singularName: 'configmap',
                namespaced: true,
                kind: 'ConfigMap',
                verbs: ['list'],
              },
            ],
          })
        ),
      ],
    },
  },
};
WithExistingProjects.storyName = 'With Existing Projects (for duplicate name testing)';
