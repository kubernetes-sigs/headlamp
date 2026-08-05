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

import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useProjectResources', () => ({
  useProjectItems: () => ({ items: [], isLoading: false }),
}));

import App from '../../App';
import Namespace from '../../lib/k8s/namespace';
import { createMuiTheme } from '../../lib/themes';
import { HeadlampEventType } from '../../redux/headlampEventSlice';
import { recordHeadlampEvents, TestContext } from '../../test';
import ProjectList, { groupNamespacesIntoProjects } from './ProjectList';
import { PROJECT_ID_LABEL } from './projectUtils';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

function ns(name: string, opts: { project?: string; cluster?: string } = {}) {
  return {
    metadata: {
      name,
      labels: opts.project ? { [PROJECT_ID_LABEL]: opts.project } : undefined,
    },
    cluster: opts.cluster ?? 'cluster-a',
  };
}

describe('groupNamespacesIntoProjects', () => {
  it('returns no projects when there are no namespaces', () => {
    expect(groupNamespacesIntoProjects([])).toEqual([]);
  });

  it('groups namespaces by project id', () => {
    const projects = groupNamespacesIntoProjects([
      ns('app-prod', { project: 'app' }),
      ns('app-staging', { project: 'app' }),
      ns('billing', { project: 'billing' }),
    ]);

    expect(projects).toEqual([
      { id: 'app', namespaces: ['app-prod', 'app-staging'], clusters: ['cluster-a'] },
      { id: 'billing', namespaces: ['billing'], clusters: ['cluster-a'] },
    ]);
  });

  it('collects clusters from every namespace in a project', () => {
    const projects = groupNamespacesIntoProjects([
      ns('shared', { project: 'app', cluster: 'cluster-a' }),
      ns('shared', { project: 'app', cluster: 'cluster-b' }),
    ]);

    expect(projects).toHaveLength(1);
    expect(projects[0].namespaces).toEqual(['shared']);
    expect(projects[0].clusters).toEqual(['cluster-a', 'cluster-b']);
  });

  it('deduplicates repeated namespaces and clusters', () => {
    const projects = groupNamespacesIntoProjects([
      ns('shared', { project: 'app', cluster: 'cluster-a' }),
      ns('shared', { project: 'app', cluster: 'cluster-a' }),
    ]);

    expect(projects).toEqual([{ id: 'app', namespaces: ['shared'], clusters: ['cluster-a'] }]);
  });

  // Regression test for #5254: a namespace without metadata.labels reached
  // the inner groupBy iteratee through a stale react-query cache and crashed
  // the Projects page with
  //   TypeError: Cannot read properties of undefined (reading 'headlamp.dev/project-id')
  it('skips namespaces with no labels instead of crashing', () => {
    expect(() =>
      groupNamespacesIntoProjects([ns('labelled', { project: 'app' }), ns('unlabelled')])
    ).not.toThrow();

    const projects = groupNamespacesIntoProjects([
      ns('labelled', { project: 'app' }),
      ns('unlabelled'),
    ]);
    expect(projects).toEqual([{ id: 'app', namespaces: ['labelled'], clusters: ['cluster-a'] }]);
  });

  it('skips namespaces whose labels object is present but has no project id', () => {
    const projects = groupNamespacesIntoProjects([
      {
        metadata: { name: 'other', labels: { 'app.kubernetes.io/name': 'x' } },
        cluster: 'cluster-a',
      },
      ns('mine', { project: 'app' }),
    ]);
    expect(projects).toEqual([{ id: 'app', namespaces: ['mine'], clusters: ['cluster-a'] }]);
  });
});

describe('ProjectList events', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches PROJECT_LIST_VIEW with the listed projects', async () => {
    vi.spyOn(Namespace, 'useList').mockReturnValue({
      items: [ns('app-prod', { project: 'app' }), ns('billing', { project: 'billing' })],
      isLoading: false,
    } as any);
    const events = recordHeadlampEvents();

    render(
      <TestContext>
        <QueryClientProvider client={new QueryClient()}>
          <ThemeProvider theme={createMuiTheme({ name: 'Light', base: 'light' })}>
            <ProjectList />
          </ThemeProvider>
        </QueryClientProvider>
      </TestContext>
    );

    await waitFor(() => {
      expect(events.filter(e => e.type === HeadlampEventType.PROJECT_LIST_VIEW)).toEqual([
        {
          type: HeadlampEventType.PROJECT_LIST_VIEW,
          data: {
            projects: [
              { id: 'app', namespaces: ['app-prod'], clusters: ['cluster-a'] },
              { id: 'billing', namespaces: ['billing'], clusters: ['cluster-a'] },
            ],
          },
        },
      ]);
    });
  });
});
