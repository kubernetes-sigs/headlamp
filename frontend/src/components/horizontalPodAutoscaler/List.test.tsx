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
import HpaList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/hpa', () => ({
  default: { kind: 'HorizontalPodAutoscaler' },
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => children,
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

const hpa = {
  referenceObject: { kind: 'Deployment', metadata: { name: 'web' } },
  metrics: () => [{ shortValue: '50%/80%' }, { shortValue: '10/20' }],
  spec: { minReplicas: 1, maxReplicas: 5 },
  status: { currentReplicas: 2 },
} as any;

describe('HpaList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    render(
      <TestContext>
        <HpaList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'name',
      'namespace',
      'cluster',
      'reference',
      'targets',
      'minReplicas',
      'maxReplicas',
      'currentReplicas',
      'labels',
      'age',
    ]);
  });

  it('reads reference, replicas and joined target values from the item', () => {
    render(
      <TestContext>
        <HpaList />
      </TestContext>
    );

    expect(getColumn('reference').getValue(hpa)).toBe('web');
    expect(getColumn('minReplicas').getValue(hpa)).toBe(1);
    expect(getColumn('maxReplicas').getValue(hpa)).toBe(5);
    expect(getColumn('currentReplicas').getValue(hpa)).toBe(2);
    expect(getColumn('targets').getValue(hpa)).toBe('50%/80%, 10/20');
  });
});
