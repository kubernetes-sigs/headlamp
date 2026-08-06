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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const project = {
  id: 'project-1',
  namespaces: ['ns1'],
  clusters: ['cluster-1'],
};

vi.mock('./ProjectList', () => ({
  useProject: () => ({ project, isLoading: false }),
}));

vi.mock('./useProjectResources', () => ({
  useProjectItems: () => ({ items: [], isLoading: false }),
}));

import App from '../../App';
import { HeadlampEventType } from '../../redux/headlampEventSlice';
import { recordHeadlampEvents, TestContext } from '../../test';
import ProjectDetails from './ProjectDetails';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

describe('ProjectDetails events', () => {
  function renderDetails() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <TestContext routerMap={{ name: project.id }}>
        <QueryClientProvider client={queryClient}>
          <ProjectDetails />
        </QueryClientProvider>
      </TestContext>
    );
  }

  it('dispatches PROJECT_DETAILS_VIEW once the project resources are loaded', async () => {
    const events = recordHeadlampEvents();

    renderDetails();

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.PROJECT_DETAILS_VIEW)).toEqual([
        {
          type: HeadlampEventType.PROJECT_DETAILS_VIEW,
          data: { project, resources: [] },
        },
      ]);
    });
  });

  it('does not dispatch PROJECT_DETAILS_TAB_CHANGE for the initially selected tab', async () => {
    const events = recordHeadlampEvents();

    renderDetails();

    await screen.findByRole('tab', { name: /Overview/ });

    expect(events.filter(e => e.type === HeadlampEventType.PROJECT_DETAILS_TAB_CHANGE)).toEqual([]);
  });

  it('dispatches PROJECT_DETAILS_TAB_CHANGE when the user switches tab', async () => {
    const events = recordHeadlampEvents();

    renderDetails();

    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));

    await waitFor(() => {
      const tabEvents = events.filter(e => e.type === HeadlampEventType.PROJECT_DETAILS_TAB_CHANGE);
      expect(tabEvents).toHaveLength(1);
      expect(tabEvents[0].data).toMatchObject({
        project,
        resources: [],
        tab: { id: 'headlamp-projects.tabs.resources' },
        previousTab: { id: 'headlamp-projects.tabs.overview' },
      });
    });
  });
});
