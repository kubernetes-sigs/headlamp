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
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import App from '../../App';
import projectsReducer, {
  addDetailsTab,
  addHeaderAction,
  ProjectDefinition,
} from '../../redux/projectsSlice';
import { TestContext } from '../../test';
import { ProjectDetailsContent } from './ProjectDetails';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

vi.mock('./useProjectResources', () => ({
  useProjectItems: () => ({ items: [], isLoading: false }),
}));

vi.mock('./ProjectDeleteButton', () => ({
  ProjectDeleteButton: () => null,
}));

describe('ProjectDetailsContent', () => {
  it('lets a project header action select a registered tab', async () => {
    const store = configureStore({ reducer: { projects: projectsReducer } });
    const project: ProjectDefinition = {
      id: 'project-one',
      namespaces: ['project-one'],
      clusters: ['test'],
    };

    store.dispatch(
      addDetailsTab({
        id: 'metrics',
        label: 'Metrics',
        icon: 'mdi:chart-line',
        component: () => <div>Metrics panel</div>,
      })
    );
    store.dispatch(
      addHeaderAction({
        id: 'open-metrics',
        component: ({ setSelectedTab }) => (
          <button onClick={() => setSelectedTab?.('metrics')}>Open metrics</button>
        ),
      })
    );

    render(
      <TestContext store={store}>
        <ProjectDetailsContent project={project} />
      </TestContext>
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Open metrics' }));

    expect(await screen.findByText('Metrics panel')).toBeInTheDocument();
  });
});
