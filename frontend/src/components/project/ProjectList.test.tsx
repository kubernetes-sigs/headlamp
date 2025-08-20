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
import projectsReducer, {
  createOrUpdateProjectAction,
  ProjectDefinition,
} from '../../redux/projectsSlice';
import { defaultApiResources } from './projectUtils';

describe('Projects Redux Slice', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        projects: projectsReducer,
      },
    });
  });

  test('should create a project', () => {
    const projectData: Omit<ProjectDefinition, 'id'> = {
      name: 'Test Project',
      description: 'A test project',
      color: '#ff0000',
      icon: 'mdi:test',
      labelSelectors: {
        'app.kubernetes.io/name': {
          value: 'test-app',
          operator: 'Equals' as const,
        },
      },
      namespaceSelectors: [
        {
          value: 'test-namespace',
          operator: 'Equals',
        },
      ],
      apiResources: defaultApiResources,
      clusterSelectors: [],
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
    };

    store.dispatch(createOrUpdateProjectAction(projectData));

    const state = store.getState();
    const projects = Object.values(state.projects.projects) as ProjectDefinition[];

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('Test Project');
    expect(projects[0].description).toBe('A test project');
    expect(Object.keys(projects[0].labelSelectors)).toHaveLength(1);
    expect(projects[0].labelSelectors['app.kubernetes.io/name'].value).toBe('test-app');
    expect(projects[0].namespaceSelectors).toHaveLength(1);
    expect(projects[0].namespaceSelectors[0].value).toBe('test-namespace');
  });
});
