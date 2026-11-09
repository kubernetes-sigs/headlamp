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

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import BindingList from './BindingList';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/roleBinding', () => ({
  default: {
    kind: 'RoleBinding',
    useList: () => ({ items: [], errors: null }),
  },
}));

vi.mock('../../lib/k8s/clusterRoleBinding', () => ({
  default: {
    kind: 'ClusterRoleBinding',
    useList: () => ({ items: [], errors: null }),
  },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function getRoleColumn() {
  const props = mockListView.mock.calls[0][0];
  return props.columns.find((c: any) => c?.id === 'role');
}

function makeItem(roleRefKind: string, roleRefName: string, namespace?: string) {
  return {
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: roleRefKind, name: roleRefName },
    getNamespace: () => namespace,
    cluster: 'test-cluster',
  };
}

describe('RoleBinding list role reference link', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('links a namespaced binding that references a ClusterRole to the ClusterRole page', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );
    render(
      <TestContext>
        {getRoleColumn().render(makeItem('ClusterRole', 'view', 'default'))}
      </TestContext>
    );

    const href = screen.getByRole('link', { name: 'view' }).getAttribute('href') ?? '';
    expect(href).toContain('/clusterroles/view');
    expect(href).not.toContain('/roles/default/view');
  });

  it('links a namespaced binding that references a Role to the Role page in its namespace', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );
    render(
      <TestContext>{getRoleColumn().render(makeItem('Role', 'pod-reader', 'default'))}</TestContext>
    );

    const href = screen.getByRole('link', { name: 'pod-reader' }).getAttribute('href') ?? '';
    expect(href).toContain('/roles/default/pod-reader');
  });

  it('links a ClusterRoleBinding to the ClusterRole page', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );
    render(<TestContext>{getRoleColumn().render(makeItem('ClusterRole', 'admin'))}</TestContext>);

    const href = screen.getByRole('link', { name: 'admin' }).getAttribute('href') ?? '';
    expect(href).toContain('/clusterroles/admin');
  });
});
