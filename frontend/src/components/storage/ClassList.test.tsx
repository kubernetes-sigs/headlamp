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
import ClassList from './ClassList';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/storageClass', () => ({
  default: { kind: 'StorageClass' },
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

describe('ClassList (StorageClass)', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders without a namespace filter and with the expected columns', () => {
    render(
      <TestContext>
        <ClassList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    expect(props.headerProps.noNamespaceFilter).toBe(true);

    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'name',
      'provisioner',
      'default',
      'reclaimPolicy',
      'volumeBindingMode',
      'allowVolumeExpansion',
      'labels',
      'age',
    ]);
  });

  it('reads provisioner and reclaim policy values from the storage class', () => {
    render(
      <TestContext>
        <ClassList />
      </TestContext>
    );

    const sc = { provisioner: 'csi.test', reclaimPolicy: 'Delete' } as any;
    expect(getColumn('provisioner').getValue(sc)).toBe('csi.test');
    expect(getColumn('reclaimPolicy').getValue(sc)).toBe('Delete');
  });

  it('renders the default column only when the class is the default', () => {
    render(
      <TestContext>
        <ClassList />
      </TestContext>
    );

    const defaultCol = getColumn('default');
    expect(defaultCol.getValue({ isDefault: true } as any)).toBe('true');
    expect(defaultCol.render({ isDefault: true } as any)).toBe('Yes');
    expect(defaultCol.render({ isDefault: false } as any)).toBeNull();
  });
});
