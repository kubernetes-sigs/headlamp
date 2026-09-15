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
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import ClusterRoleBinding from '../../lib/k8s/clusterRoleBinding';
import RoleBinding, { KubeRoleBinding } from '../../lib/k8s/roleBinding';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import BindingList from './BindingList';

// Initialize the Kubernetes class registry and routes before rendering resource links.
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const theme = createMuiTheme({ base: 'light', name: 'light' });

function listResult(items: (RoleBinding | ClusterRoleBinding)[]) {
  return Object.assign([items, null] as [typeof items, null], {
    items,
    data: [],
    error: null,
    errors: null,
    isLoading: false,
    isFetching: false,
    isSuccess: true,
    isError: false,
    status: 'success' as const,
  });
}

afterEach(() => {
  cleanup();
  vi.mocked(RoleBinding.useList).mockRestore();
  vi.mocked(ClusterRoleBinding.useList).mockRestore();
});

describe('RoleBinding role links', () => {
  it.each([
    ['RoleBinding', 'Role', 'default', '/roles/default/view'],
    ['RoleBinding', 'ClusterRole', 'default', '/clusterroles/view'],
    ['ClusterRoleBinding', 'ClusterRole', undefined, '/clusterroles/view'],
  ])('links %s referencing %s to the correct resource', (kind, roleKind, namespace, path) => {
    const data: KubeRoleBinding = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind,
      metadata: {
        name: 'view-binding',
        namespace,
        uid: 'view-binding-uid',
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: roleKind, name: 'view' },
      subjects: [],
    };
    const binding =
      kind === 'RoleBinding'
        ? new RoleBinding(data, 'binding-cluster')
        : new ClusterRoleBinding(data, 'binding-cluster');

    vi.spyOn(RoleBinding, 'useList').mockReturnValue(
      listResult(kind === 'RoleBinding' ? [binding] : [])
    );
    vi.spyOn(ClusterRoleBinding, 'useList').mockReturnValue(
      listResult(kind === 'ClusterRoleBinding' ? [binding] : [])
    );

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <TestContext>
        <QueryClientProvider client={client}>
          <ThemeProvider theme={theme}>
            <BindingList />
          </ThemeProvider>
        </QueryClientProvider>
      </TestContext>
    );

    expect(screen.getByRole('link', { name: 'view' })).toHaveAttribute(
      'href',
      `/c/binding-cluster${path}`
    );
    client.clear();
  });
});
