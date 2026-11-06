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

function bindingWithServiceAccount(name: string) {
  return { subjects: [{ kind: 'ServiceAccount', name }] };
}

describe('RoleBindingList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('sorts the Service Accounts column by service account name', () => {
    render(
      <TestContext>
        <BindingList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const column = props.columns.find((c: any) => c?.id === 'serviceaccounts');

    const alpha = bindingWithServiceAccount('alpha');
    const zeta = bindingWithServiceAccount('zeta');

    expect(column.sort(alpha, zeta)).toBeLessThan(0);
    expect(column.sort(zeta, alpha)).toBeGreaterThan(0);
  });
});
