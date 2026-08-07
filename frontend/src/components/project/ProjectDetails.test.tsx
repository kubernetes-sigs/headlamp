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
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, vi } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const project: ProjectDefinition = {
    id: 'project-one',
    namespaces: ['project-one'],
    clusters: ['test'],
  };

  function createStore() {
    return configureStore({
      reducer: { projects: projectsReducer },
      middleware: getDefaultMiddleware =>
        getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
    });
  }

  it('lets a project header action select a registered tab', async () => {
    const store = createStore();

    store.dispatch(
      addDetailsTab({
        id: 'metrics',
        label: 'Metrics',
        icon: 'mdi:view-dashboard',
        component: () => <div>Metrics panel</div>,
      })
    );
    store.dispatch(
      addDetailsTab({
        id: 'unavailable',
        label: 'Unavailable',
        icon: 'mdi:view-dashboard',
        component: undefined,
      })
    );
    store.dispatch(
      addHeaderAction({
        id: 'open-metrics',
        component: ({ setSelectedTab }) => (
          <>
            <button onClick={() => setSelectedTab?.('metrics')}>Open metrics</button>
            <button onClick={() => setSelectedTab?.('unavailable')}>Open unavailable</button>
          </>
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

    fireEvent.click(screen.getByRole('button', { name: 'Open unavailable' }));

    expect(screen.getByText('Metrics panel')).toBeInTheDocument();
  });

  it('renders only header actions whose enablement check succeeds', async () => {
    const store = createStore();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    store.dispatch(
      addHeaderAction({
        id: 'enabled',
        component: () => <button>Enabled action</button>,
        isEnabled: async () => true,
      })
    );
    store.dispatch(
      addHeaderAction({
        id: 'disabled',
        component: () => <button>Disabled action</button>,
        isEnabled: async () => false,
      })
    );
    store.dispatch(
      addHeaderAction({
        id: 'rejected',
        component: () => <button>Rejected action</button>,
        isEnabled: async () => {
          throw new Error('enablement failed');
        },
      })
    );

    render(
      <TestContext store={store}>
        <ProjectDetailsContent project={project} />
      </TestContext>
    );

    expect(await screen.findByRole('button', { name: 'Enabled action' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disabled action' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rejected action' })).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to check if header action is enabled',
      expect.objectContaining({ id: 'rejected' }),
      expect.any(Error)
    );
  });

  it('does not update header actions after unmounting', async () => {
    const store = createStore();
    let resolveEnablement: (enabled: boolean) => void = () => {};

    store.dispatch(
      addHeaderAction({
        id: 'delayed',
        component: () => <button>Delayed action</button>,
        isEnabled: () =>
          new Promise(resolve => {
            resolveEnablement = resolve;
          }),
      })
    );

    const view = render(
      <TestContext store={store}>
        <ProjectDetailsContent project={project} />
      </TestContext>
    );
    view.unmount();

    await act(async () => resolveEnablement(true));

    expect(screen.queryByRole('button', { name: 'Delayed action' })).not.toBeInTheDocument();
  });
});
