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
import PDBList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/podDisruptionBudget', () => ({
  default: { kind: 'PodDisruptionBudget' },
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

describe('PDBList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    render(
      <TestContext>
        <PDBList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'name',
      'namespace',
      'cluster',
      'minAvailable',
      'maxUnavailable',
      'allowedDisruptions',
      'labels',
      'age',
    ]);
  });

  it('reads min/max and allowed disruptions from the item', () => {
    render(
      <TestContext>
        <PDBList />
      </TestContext>
    );

    const pdb = {
      spec: { minAvailable: 2, maxUnavailable: 1 },
      status: { disruptionsAllowed: 3 },
    } as any;

    expect(getColumn('minAvailable').getValue(pdb)).toBe(2);
    expect(getColumn('maxUnavailable').getValue(pdb)).toBe(1);
    expect(getColumn('allowedDisruptions').getValue(pdb)).toBe(3);
  });

  it('falls back to N/A when fields are missing', () => {
    render(
      <TestContext>
        <PDBList />
      </TestContext>
    );

    const empty = { spec: {}, status: {} } as any;
    expect(getColumn('minAvailable').getValue(empty)).toContain('N/A');
    expect(getColumn('allowedDisruptions').getValue(empty)).toContain('N/A');
  });
});
