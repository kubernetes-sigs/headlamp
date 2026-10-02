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
import React from 'react';
import reducers from '../../redux/reducers/reducers';
import { API_BASE, TestContext } from '../../test';
import ProjectList from './ProjectList';
import { PROJECT_ID_LABEL } from './projectUtils';

export default {
  title: 'project/ProjectList',
  component: ProjectList,
  argTypes: {},
} as Meta;

const Template: StoryFn = () => {
  return (
    <TestContext>
      <ProjectList />
    </TestContext>
  );
};

export const Empty = Template.bind({});

const customGroupingStore = configureStore({
  reducer: reducers,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
  preloadedState: {
    config: {
      clusters: {
        production: { name: 'production' },
        staging: { name: 'staging' },
      } as any,
      statelessClusters: null,
      allClusters: {
        production: { name: 'production' },
        staging: { name: 'staging' },
      } as any,
      settings: {
        tableRowsPerPageOptions: [15, 25, 50],
        timezone: 'UTC',
        sidebarSortAlphabetically: false,
        useEvict: true,
        expandLargeGraph: false,
      },
      isDynamicClusterEnabled: false,
      allowKubeconfigChanges: false,
      defaultPodDebugImage: '',
      defaultNodeShellImage: '',
      defaultNodeShellNamespace: '',
    },
    projects: {
      headerActions: {},
      customCreateProject: {},
      detailsTabs: {},
      overviewSections: {},
      apiResources: [],
      projectGrouping: {
        getProjectKey: ({ namespace, projectId }) => `${projectId}:${namespace.cluster}`,
      },
    },
  },
});

const CustomGroupingTemplate: StoryFn = () => (
  <TestContext store={customGroupingStore}>
    <ProjectList />
  </TestContext>
);

export const CustomGrouping = CustomGroupingTemplate.bind({});
CustomGrouping.parameters = {
  storyshots: { disable: true },
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/clusters/:cluster/api/v1/namespaces`, ({ params }) =>
          HttpResponse.json({
            apiVersion: 'v1',
            kind: 'NamespaceList',
            metadata: {},
            items: [
              {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                  name: `payments-${params.cluster}`,
                  labels: {
                    [PROJECT_ID_LABEL]: 'payments',
                  },
                },
              },
            ],
          })
        ),
        http.get(`${API_BASE}/clusters/:cluster/*`, () =>
          HttpResponse.json({
            apiVersion: 'v1',
            kind: 'List',
            metadata: {},
            items: [],
          })
        ),
      ],
    },
  },
};
