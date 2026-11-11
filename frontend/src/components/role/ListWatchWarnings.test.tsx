/*
 * Copyright 2026 The Kubernetes Authors
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

import '../../lib/router';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
import ClusterRole from '../../lib/k8s/clusterRole';
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import type { KubeObject } from '../../lib/k8s/KubeObject';
import Namespace from '../../lib/k8s/namespace';
import Role from '../../lib/k8s/role';
import RoleBinding from '../../lib/k8s/roleBinding';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import RoleBindingList from './BindingList';
import RoleList from './List';

function loadedList<T extends KubeObject>(items: T[], watchErrors: ApiError[] = []) {
  const tuple: [T[] | null, ApiError | null] = [items, null];
  return Object.assign(tuple, {
    data: [],
    dataUpdatedAt: 1,
    items,
    errors: null,
    error: null,
    watchErrors,
    isError: false,
    isSuccess: true,
    isLoading: false,
    isFetching: false,
    status: 'success' as const,
  });
}

const metadata = {
  name: 'retained-resource',
  namespace: 'team-a',
  uid: 'retained-resource',
  creationTimestamp: '2026-11-25T12:00:00Z',
};
const roleRef = { kind: 'Role', name: 'reader', apiGroup: 'rbac.authorization.k8s.io' };
const cases = [
  {
    name: 'roles',
    View: RoleList,
    namespacedClass: Role,
    clusterClass: ClusterRole,
    namespaced: new Role(
      { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'Role', metadata, rules: [] },
      'test'
    ),
    clustered: new ClusterRole(
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRole',
        metadata: { ...metadata, name: 'cluster-resource', namespace: undefined },
        rules: [],
      },
      'test'
    ),
  },
  {
    name: 'role bindings',
    View: RoleBindingList,
    namespacedClass: RoleBinding,
    clusterClass: ClusterRoleBinding,
    namespaced: new RoleBinding(
      {
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'RoleBinding',
        metadata,
        roleRef,
        subjects: [],
      },
      'test'
    ),
    clustered: new ClusterRoleBinding(
      {
        kind: 'ClusterRoleBinding',
        apiVersion: 'rbac.authorization.k8s.io/v1',
        metadata: { ...metadata, name: 'cluster-resource', namespace: undefined },
        roleRef: { ...roleRef, kind: 'ClusterRole' },
        subjects: [],
      },
      'test'
    ),
  },
];

const clients = new Set<QueryClient>();
let previousURL: string;

beforeEach(() => {
  previousURL = window.location.href;
  window.history.replaceState({}, '', '/c/test/roles');
  vi.spyOn(Namespace, 'useList').mockReturnValue(loadedList<Namespace>([]));
});

afterEach(async () => {
  cleanup();
  for (const client of clients) {
    await client.cancelQueries();
    client.clear();
  }
  clients.clear();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', previousURL);
});

describe.each(cases)(
  '$name watch warnings',
  ({ View, namespacedClass, clusterClass, namespaced, clustered }) => {
    it.each([false, true])(
      'shows both stopped-watch warnings without hiding loaded results (empty=%s)',
      empty => {
        const warning = new ApiError('Namespaced resource updates have stopped', {
          cluster: 'test',
        });
        const clusterWarning = new ApiError('Cluster resource updates have stopped', {
          cluster: 'test',
        });
        const items = empty ? [] : [namespaced];
        const clusterItems = empty ? [] : [clustered];
        const namespacedList = vi
          .spyOn(namespacedClass, 'useList')
          .mockReturnValue(loadedList(items, [warning]));
        const clusterList = vi
          .spyOn(clusterClass, 'useList')
          .mockReturnValue(loadedList(clusterItems, [clusterWarning]));
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        clients.add(client);
        const content = () => (
          <QueryClientProvider client={client}>
            <ThemeProvider theme={createMuiTheme({ base: 'light', name: 'light' })}>
              <TestContext urlPrefix="/c" routerMap={{ cluster: 'test', resource: 'roles' }}>
                <View />
              </TestContext>
            </ThemeProvider>
          </QueryClientProvider>
        );
        const result = render(content());
        expect(screen.getByText(warning.message)).toBeInTheDocument();
        expect(screen.getByText(clusterWarning.message)).toBeInTheDocument();
        if (!empty) expect(screen.getByRole('link', { name: metadata.name })).toBeInTheDocument();

        namespacedList.mockReturnValue(loadedList(items));
        clusterList.mockReturnValue(loadedList(clusterItems));
        result.rerender(content());
        expect(screen.queryByText(warning.message)).not.toBeInTheDocument();
        expect(screen.queryByText(clusterWarning.message)).not.toBeInTheDocument();
        if (!empty) expect(screen.getByRole('link', { name: metadata.name })).toBeInTheDocument();
      }
    );
  }
);
