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
import { useState } from 'react';
import { DefaultCreateProject } from '../../redux/projectsSlice';
import reducers from '../../redux/reducers/reducers';
import { API_BASE, TestContext } from '../../test';
import { NewProjectPopup } from './NewProjectPopup';
import { PROJECT_ID_LABEL } from './projectUtils';

export default {
  title: 'project/NewProjectPopup',
  component: NewProjectPopup,
  argTypes: {},
  decorators: [Story => <Story />],
} as Meta;

const makeStore = (customCreateProject = {}) => {
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
        customCreateProject,
        detailsTabs: {},
        overviewSections: {},
        apiResources: [],
      },
    },
  });
};

const Template: StoryFn<{ store: ReturnType<typeof configureStore> }> = args => {
  const { store } = args;
  const [open, setOpen] = useState(true);
  return (
    <TestContext store={store}>
      <button onClick={() => setOpen(true)}>Open Popup</button>
      <NewProjectPopup open={open} onClose={() => setOpen(false)} />
    </TestContext>
  );
};

export const Default = Template.bind({});
Default.args = {
  store: makeStore(),
};
Default.parameters = {
  msw: {
    handlers: {
      story: [
        http.get(`${API_BASE}/api/v1/namespaces`, () =>
          HttpResponse.json({
            kind: 'NamespaceList',
            items: [],
            metadata: {},
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
        http.get(`${API_BASE}/api/v1/namespaces`, () =>
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
                  name: 'another-project',
                  uid: 'ns-2',
                  labels: {
                    [PROJECT_ID_LABEL]: 'another-project',
                  },
                },
              },
              {
                apiVersion: 'v1',
                kind: 'Namespace',
                metadata: {
                  name: 'default',
                  uid: 'ns-3',
                },
              },
            ],
            metadata: {},
          })
        ),
      ],
    },
  },
};
WithExistingProjects.storyName = 'With Existing Projects (for duplicate name testing)';

const ReplacementForm = ({ onBack }: { onBack: () => void }) => (
  <div>
    <h2>Managed project</h2>
    <button onClick={onBack}>Back</button>
  </div>
);

export const WithReplacedChoices = Template.bind({});
WithReplacedChoices.args = {
  store: makeStore({
    [DefaultCreateProject.NEW_PROJECT]: {
      id: DefaultCreateProject.NEW_PROJECT,
      name: 'Create Managed Project',
      description: 'Create a project managed by the platform',
      icon: 'mdi:folder-plus',
      component: ReplacementForm,
    },
    [DefaultCreateProject.FROM_YAML]: {
      id: DefaultCreateProject.FROM_YAML,
      name: 'Import Platform Project',
      description: 'Import a project from a platform definition',
      icon: 'mdi:file-document-add',
      component: ReplacementForm,
    },
  }),
};
WithReplacedChoices.parameters = Default.parameters;
