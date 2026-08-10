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
import type { KubeRoleBinding } from '../../lib/k8s/roleBinding';
import { TestContext } from '../../test';
import RoleBindingList from './BindingList';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/roleBinding', () => ({
  default: { useList: () => ({ items: [], errors: null }) },
}));

vi.mock('../../lib/k8s/clusterRoleBinding', () => ({
  default: { useList: () => ({ items: [], errors: null }) },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function makeBinding(subjects: KubeRoleBinding['subjects'], namespace?: string) {
  return {
    subjects,
    cluster: 'my-cluster',
    getNamespace: () => namespace,
  };
}

function serviceAccountColumn() {
  render(
    <TestContext>
      <RoleBindingList />
    </TestContext>
  );

  return mockListView.mock.calls[0][0].columns.find((c: any) => c?.id === 'serviceaccounts');
}

describe('RoleBindingList service accounts column', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('sorts on the service account subjects and ignores the other kinds', () => {
    const column = serviceAccountColumn();
    const alpha = makeBinding(
      [
        { apiGroup: 'rbac.authorization.k8s.io', kind: 'User', name: 'zoe' },
        { kind: 'ServiceAccount', name: 'alpha', namespace: 'ci' },
      ],
      'ci'
    );
    const beta = makeBinding(
      [
        { apiGroup: 'rbac.authorization.k8s.io', kind: 'User', name: 'adam' },
        { kind: 'ServiceAccount', name: 'beta', namespace: 'ci' },
      ],
      'ci'
    );

    expect(column.sort(alpha, beta)).toBeLessThan(0);
    expect(column.sort(beta, alpha)).toBeGreaterThan(0);
    expect(column.sort(alpha, alpha)).toBe(0);
  });
});
