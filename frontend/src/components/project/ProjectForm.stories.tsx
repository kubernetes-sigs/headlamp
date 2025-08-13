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
import { ProjectDefinition } from '../../redux/projectsSlice';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import ProjectForm from './ProjectForm';

export default {
  title: 'project/ProjectForm',
  component: ProjectForm,
  argTypes: {},
  decorators: [Story => <Story />],
} as Meta;

const makeCreateStore = () =>
  configureStore({
    reducer: reducers,
    preloadedState: {
      projects: {
        projects: {},
        customCreateProject: {},
        detailsTabs: {},
        overviewSections: {},
      },
    },
  });

const makeEditStore = () => {
  const now = new Date().toISOString();
  const base: Omit<ProjectDefinition, 'id' | 'createdAt' | 'updatedAt'> = {
    name: 'Shopping Cart',
    description: 'E-commerce cart microservice',
    color: '#1976d2',
    icon: 'mdi:cart',
    labelSelectors: {
      'app.kubernetes.io/name': { operator: 'Equals', value: 'shopping-cart' },
    },
    namespaceSelectors: [{ operator: 'Equals', value: 'default' }],
    clusterSelectors: [],
    apiResources: [],
  };

  const project: ProjectDefinition = {
    ...base,
    id: 'project-1',
    createdAt: now,
    updatedAt: now,
  };

  return configureStore({
    reducer: reducers,
    preloadedState: {
      projects: {
        projects: { [project.id]: project },
        customCreateProject: {},
        detailsTabs: {},
        overviewSections: {},
      },
    },
  });
};

const Template: StoryFn<{
  store: ReturnType<typeof configureStore>;
  router?: Record<string, string>;
}> = args => {
  const { store, router } = args;
  return (
    <TestContext store={store} routerMap={router}>
      <div style={{ height: 800 }}>
        <ProjectForm />
      </div>
    </TestContext>
  );
};

export const CreateNew = Template.bind({});
CreateNew.args = {
  store: makeCreateStore(),
};

export const EditExisting = Template.bind({});
EditExisting.args = {
  store: makeEditStore(),
  router: { projectId: 'project-1' },
};
