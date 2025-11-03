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
import { act, render, screen, waitFor } from '@testing-library/react';
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

import { addOverviewSection, ProjectDefinition } from '../../redux/projectsSlice';
import reducers from '../../redux/reducers/reducers';
import { TestContext } from '../../test';
import { ProjectDetailsContent } from './ProjectDetails';
import { useProjectItems } from './useProjectResources';

vi.mock('./useProjectResources', () => ({
  useProjectItems: vi.fn(),
}));

const project: ProjectDefinition = {
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
      <ProjectDetailsContent project={project} />
    </TestContext>
  );
}

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
    expect(isEnabled).toHaveBeenCalledWith({ project });
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

    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project }));
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

      await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project }));
      expect(screen.queryByText('Failed section')).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('continues evaluating sections when an isEnabled predicate throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const isEnabled = vi.fn(() => {
        throw new Error('predicate threw');
      });
      renderProjectOverview([
        {
          id: 'failed',
          component: () => <div>Failed section</div>,
          isEnabled,
        },
        {
          id: 'visible',
          component: () => <div>Visible section</div>,
        },
      ]);

      expect(await screen.findByText('Visible section')).toBeInTheDocument();
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
        <ProjectDetailsContent project={project} />
      </TestContext>
    );
    await screen.findByText('Project-specific section');

    const nextProject = { ...project, id: 'project-b' };
    rerender(
      <TestContext store={store}>
        <ProjectDetailsContent project={nextProject} />
      </TestContext>
    );

    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project: nextProject }));
    expect(isEnabled).toHaveBeenCalledTimes(2);
  });

  it('hides sections from the previous project while predicates are rechecked', async () => {
    let resolveNextProject: (enabled: boolean) => void = () => {};
    const isEnabled = vi.fn(({ project: currentProject }: { project: ProjectDefinition }) =>
      currentProject.id === project.id
        ? Promise.resolve(true)
        : new Promise<boolean>(resolve => {
            resolveNextProject = resolve;
          })
    );
    const store = configureStore({
      reducer: reducers,
      middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }),
    });
    store.dispatch(
      addOverviewSection({
        id: 'project-specific',
        component: ({ project }) => <div>Section for {project.id}</div>,
        isEnabled,
      })
    );

    const { rerender } = render(
      <TestContext store={store}>
        <ProjectDetailsContent project={project} />
      </TestContext>
    );
    await screen.findByText('Section for project-a');

    const nextProject = { ...project, id: 'project-b' };
    rerender(
      <TestContext store={store}>
        <ProjectDetailsContent project={nextProject} />
      </TestContext>
    );

    expect(screen.queryByText('Section for project-b')).not.toBeInTheDocument();
    await act(async () => resolveNextProject(false));
  });

  it('ignores a predicate result from the previously rendered project', async () => {
    let resolveFirstPredicate: (enabled: boolean) => void = () => {};
    const isEnabled = vi.fn(({ project: currentProject }: { project: ProjectDefinition }) =>
      currentProject.id === project.id
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
        <ProjectDetailsContent project={project} />
      </TestContext>
    );
    await waitFor(() => expect(isEnabled).toHaveBeenCalledWith({ project }));

    const nextProject = { ...project, id: 'project-b' };
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
