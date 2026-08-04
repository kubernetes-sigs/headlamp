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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { vi } from 'vitest';

const { MockKubeObject } = vi.hoisted(() => {
  class MockKubeObject {
    static kind = '';
    jsonData: any;

    constructor(data: any) {
      this.jsonData = data;
    }

    get kind() {
      return this.jsonData?.kind;
    }
  }

  return { MockKubeObject };
});

vi.mock('../../lib/k8s/KubeObject', () => ({ KubeObject: MockKubeObject }));
vi.mock('./ProjectDeleteButton', () => ({ ProjectDeleteButton: () => null }));

const eventProject = {
  id: 'project-1',
  namespaces: ['ns1'],
  clusters: ['cluster-1'],
};

vi.mock('./ProjectList', () => ({
  useProject: () => ({ project: eventProject, isLoading: false }),
}));

import App from '../../App';
import { HeadlampEventType } from '../../redux/headlampEventSlice';
import { addOverviewSection, ProjectDefinition } from '../../redux/projectsSlice';
import reducers from '../../redux/reducers/reducers';
import { recordHeadlampEvents, TestContext } from '../../test';
import ProjectDetails, { ProjectDetailsContent } from './ProjectDetails';
import { useProjectItems } from './useProjectResources';

vi.mock('./useProjectResources', () => ({
  useProjectItems: vi.fn(),
}));

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const overviewProject: ProjectDefinition = {
  id: 'project-a',
  namespaces: ['namespace-a'],
  clusters: ['cluster-a'],
};

function renderProjectOverview(
  sections: Array<{
    id: string;
    component: () => ReactNode;
    isEnabled?: ({ project }: { project: ProjectDefinition }) => Promise<boolean>;
  }>
) {
  const store = configureStore({
    reducer: reducers,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
  });
  sections.forEach(section => store.dispatch(addOverviewSection(section)));

  return render(
    <TestContext store={store}>
      <ProjectDetailsContent project={overviewProject} />
    </TestContext>
  );
}

describe('ProjectDetails events', () => {
  beforeEach(() => {
    vi.mocked(useProjectItems).mockReturnValue({ items: [], errors: [], isLoading: false });
  });

  function renderDetails() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <TestContext routerMap={{ name: eventProject.id }}>
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
      expect(events.filter(event => event.type === HeadlampEventType.PROJECT_DETAILS_VIEW)).toEqual(
        [
          {
            type: HeadlampEventType.PROJECT_DETAILS_VIEW,
            data: { project: eventProject, resources: [] },
          },
        ]
      );
    });
  });

  it('does not dispatch PROJECT_DETAILS_TAB_CHANGE for the initially selected tab', async () => {
    const events = recordHeadlampEvents();

    renderDetails();

    await screen.findByRole('tab', { name: /Overview/ });

    expect(
      events.filter(event => event.type === HeadlampEventType.PROJECT_DETAILS_TAB_CHANGE)
    ).toEqual([]);
  });

  it('dispatches PROJECT_DETAILS_TAB_CHANGE when the user switches tab', async () => {
    const events = recordHeadlampEvents();

    renderDetails();

    fireEvent.click(await screen.findByRole('tab', { name: /Resources/ }));

    await waitFor(() => {
      const tabEvents = events.filter(
        event => event.type === HeadlampEventType.PROJECT_DETAILS_TAB_CHANGE
      );
      expect(tabEvents).toHaveLength(1);
      expect(tabEvents[0].data).toMatchObject({
        project: eventProject,
        resources: [],
        tab: { id: 'headlamp-projects.tabs.resources' },
        previousTab: { id: 'headlamp-projects.tabs.overview' },
      });
    });
  });
});

describe('ProjectDetails overview sections', () => {
  beforeEach(() => {
    vi.mocked(useProjectItems).mockReturnValue({ items: [], errors: [], isLoading: false });
  });

  it('renders a section without an isEnabled predicate', async () => {
    renderProjectOverview([
      {
        id: 'always-visible',
        component: () => <div>Always visible</div>,
      },
    ]);

    expect(await screen.findByText('Always visible')).toBeInTheDocument();
  });

  it('renders a section when its isEnabled predicate resolves true', async () => {
    const isEnabled = vi.fn().mockResolvedValue(true);
    renderProjectOverview([
      {
        id: 'enabled',
        component: () => <div>Enabled section</div>,
        isEnabled,
      },
    ]);

    expect(await screen.findByText('Enabled section')).toBeInTheDocument();
    expect(isEnabled).toHaveBeenCalledWith({ project: overviewProject });
  });

  it('does not render a section when its isEnabled predicate resolves false', async () => {
    const isEnabled = vi.fn().mockResolvedValue(false);
    renderProjectOverview([
      {
        id: 'disabled',
        component: () => <div>Disabled section</div>,
        isEnabled,
      },
    ]);

    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project: overviewProject }));
    expect(screen.queryByText('Disabled section')).not.toBeInTheDocument();
  });

  it('does not render a section when its isEnabled predicate rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const isEnabled = vi.fn().mockRejectedValue(new Error('predicate failed'));
      renderProjectOverview([
        {
          id: 'failed',
          component: () => <div>Failed section</div>,
          isEnabled,
        },
      ]);

      await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project: overviewProject }));
      expect(screen.queryByText('Failed section')).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('rechecks conditional sections when the project changes', async () => {
    const isEnabled = vi.fn().mockResolvedValue(true);
    const store = configureStore({
      reducer: reducers,
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(
      addOverviewSection({
        id: 'project-specific',
        component: () => <div>Project-specific section</div>,
        isEnabled,
      })
    );

    const { rerender } = render(
      <TestContext store={store}>
        <ProjectDetailsContent project={overviewProject} />
      </TestContext>
    );
    await screen.findByText('Project-specific section');

    const nextProject = { ...overviewProject, id: 'project-b' };
    rerender(
      <TestContext store={store}>
        <ProjectDetailsContent project={nextProject} />
      </TestContext>
    );

    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project: nextProject }));
    expect(isEnabled).toHaveBeenCalledTimes(2);
  });

  it('ignores a predicate result from the previously rendered project', async () => {
    let resolveFirstPredicate: (enabled: boolean) => void = () => {};
    const isEnabled = vi.fn(({ project: currentProject }: { project: ProjectDefinition }) =>
      currentProject.id === overviewProject.id
        ? new Promise<boolean>(resolve => {
            resolveFirstPredicate = resolve;
          })
        : Promise.resolve(false)
    );
    const store = configureStore({
      reducer: reducers,
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(
      addOverviewSection({
        id: 'project-specific',
        component: () => <div>Stale project section</div>,
        isEnabled,
      })
    );

    const { rerender } = render(
      <TestContext store={store}>
        <ProjectDetailsContent project={overviewProject} />
      </TestContext>
    );
    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project: overviewProject }));

    const nextProject = { ...overviewProject, id: 'project-b' };
    rerender(
      <TestContext store={store}>
        <ProjectDetailsContent project={nextProject} />
      </TestContext>
    );
    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project: nextProject }));

    await act(async () => resolveFirstPredicate(true));

    expect(screen.queryByText('Stale project section')).not.toBeInTheDocument();
  });
});
