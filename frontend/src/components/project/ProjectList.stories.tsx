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
import React from 'react';
import { ProjectDefinition } from '../../redux/projectsSlice';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import ProjectList from './ProjectList';

export default {
  title: 'project/ProjectList',
  component: ProjectList,
  argTypes: {},
  decorators: [Story => <Story />],
} as Meta;

const makeStoreWithProjects = () => {
  const now = new Date().toISOString();

  const sampleProjects: Array<Omit<ProjectDefinition, 'id' | 'createdAt' | 'updatedAt'>> = [
    {
      name: 'Shopping Cart',
      description: 'E-commerce cart microservice',
      color: '#1976d2',
      icon: 'mdi:cart',
      labelSelectors: {
        'app.kubernetes.io/name': { operator: 'Equals', value: 'shopping-cart' },
      },
      namespaceSelectors: [],
      clusterSelectors: [],
      apiResources: [],
    },
    {
      name: 'Payments',
      description: 'Payments processing service',
      color: '#2e7d32',
      icon: 'mdi:credit-card',
      labelSelectors: {
        'app.kubernetes.io/name': { operator: 'Equals', value: 'payments' },
      },
      namespaceSelectors: [],
      clusterSelectors: [],
      apiResources: [],
    },
  ];

  const projects = Object.fromEntries(
    sampleProjects.map((p, idx) => [
      `project-${idx + 1}`,
      { ...p, id: `project-${idx + 1}`, createdAt: now, updatedAt: now },
    ])
  );

  return configureStore({
    reducer: reducers,
    preloadedState: {
      projects: {
        projects,
        customCreateProject: {},
        detailsTabs: {},
        overviewSections: {},
      },
    },
  });
};

// Ensure a deterministic empty-state regardless of local storage
const makeEmptyStore = () =>
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

const Template: StoryFn<{ store?: ReturnType<typeof configureStore> }> = args => {
  const { store } = args;

  return (
    <TestContext store={store}>
      <ProjectList />
    </TestContext>
  );
};

export const Empty = Template.bind({});
Empty.args = {
  store: makeEmptyStore(),
};

export const WithProjects = Template.bind({});
WithProjects.args = {
  store: makeStoreWithProjects(),
};
