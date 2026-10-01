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

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import BindingList from './BindingList';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/roleBinding', () => ({
  default: {
    useList: () => ({ items: [], errors: null }),
  },
}));

vi.mock('../../lib/k8s/clusterRoleBinding', () => ({
  default: {
    useList: () => ({ items: [], errors: null }),
  },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function getColumn(id: string) {
  const props = mockListView.mock.calls[0][0];
  return props.columns.find((c: any) => c?.id === id);
}

describe('RoleBindingList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders expected columns', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'type',
      'name',
      'namespace',
      'cluster',
      'role',
      'users',
      'groups',
      'serviceaccounts',
      'labels',
      'age',
    ]);
  });

  it('formats service account subjects with namespace when different from binding namespace', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );

    const saCol = getColumn('serviceaccounts');

    // Same namespace RoleBinding -> just name
    const sameNsBinding = {
      getNamespace: () => 'default',
      subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'default' }],
    };
    expect(saCol.getValue(sameNsBinding)).toBe('my-sa');

    // Cross namespace RoleBinding -> namespace/name
    const diffNsBinding = {
      getNamespace: () => 'default',
      subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'kube-system' }],
    };
    expect(saCol.getValue(diffNsBinding)).toBe('kube-system/my-sa');
    const renderedDiff = render(<TestContext>{saCol.render(diffNsBinding)}</TestContext>);
    expect(renderedDiff.getByText('kube-system/my-sa')).toBeInTheDocument();

    // ClusterRoleBinding (no namespace) -> namespace/name
    const clusterBinding = {
      getNamespace: () => undefined,
      subjects: [{ kind: 'ServiceAccount', name: 'my-sa', namespace: 'custom-ns' }],
    };
    expect(saCol.getValue(clusterBinding)).toBe('custom-ns/my-sa');
    const renderedCluster = render(<TestContext>{saCol.render(clusterBinding)}</TestContext>);
    expect(renderedCluster.getByText('custom-ns/my-sa')).toBeInTheDocument();

    // Handle missing/empty subjects safely
    expect(saCol.getValue({})).toBeUndefined();
  });

  it('sorts service account subjects correctly', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );

    const saCol = getColumn('serviceaccounts');

    const bindingA = {
      getNamespace: () => 'default',
      subjects: [{ kind: 'ServiceAccount', name: 'a-sa', namespace: 'default' }],
    } as any;

    const bindingB = {
      getNamespace: () => 'default',
      subjects: [{ kind: 'ServiceAccount', name: 'b-sa', namespace: 'default' }],
    } as any;

    const bindingCross = {
      getNamespace: () => 'default',
      subjects: [{ kind: 'ServiceAccount', name: 'a-sa', namespace: 'z-ns' }],
    } as any;

    expect(saCol.sort(bindingA, bindingB)).toBeLessThan(0);
    expect(saCol.sort(bindingB, bindingA)).toBeGreaterThan(0);
    expect(saCol.sort(bindingA, bindingCross)).toBeLessThan(0);

    // Multi-subject collision disambiguation (e.g. ['a', 'bc'] vs ['ab', 'c'])
    const bindingMultiA = {
      getNamespace: () => 'default',
      subjects: [
        { kind: 'ServiceAccount', name: 'a', namespace: 'default' },
        { kind: 'ServiceAccount', name: 'bc', namespace: 'default' },
      ],
    } as any;

    const bindingMultiB = {
      getNamespace: () => 'default',
      subjects: [
        { kind: 'ServiceAccount', name: 'ab', namespace: 'default' },
        { kind: 'ServiceAccount', name: 'c', namespace: 'default' },
      ],
    } as any;

    expect(saCol.sort(bindingMultiA, bindingMultiB)).not.toBe(0);
  });
});
