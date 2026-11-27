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

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import VpaList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/vpa', () => ({
  default: { kind: 'VerticalPodAutoscaler', isEnabled: () => Promise.resolve(true) },
}));

// Only the list view is under test, not the "checking if enabled" placeholder.
vi.mock('../common/SectionBox', () => ({ default: () => null }));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

async function renderColumns() {
  render(
    <TestContext>
      <VpaList />
    </TestContext>
  );
  await waitFor(() => expect(mockListView).toHaveBeenCalled());
  return mockListView.mock.calls[0][0].columns;
}

function vpa(name: string, target?: { cpu?: string; memory?: string }) {
  return { metadata: { name }, targetRecommendations: target ?? null };
}

function sortedNames(columns: any[], id: string, items: ReturnType<typeof vpa>[]) {
  const column = columns.find((c: any) => c?.id === id);
  return [...items].sort(column.sort).map(item => item.metadata.name);
}

describe('VpaList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('sorts the CPU column by the recommended amount, not as text', async () => {
    const columns = await renderColumns();
    const items = [
      vpa('one-core', { cpu: '1' }),
      vpa('small', { cpu: '25m' }),
      vpa('big', { cpu: '1500m' }),
      vpa('mid', { cpu: '587m' }),
    ];

    expect(sortedNames(columns, 'cpu', items)).toEqual(['small', 'mid', 'one-core', 'big']);
  });

  it('sorts the Memory column by size in bytes, not as text', async () => {
    const columns = await renderColumns();
    // 262144k is 262,144,000 bytes, 1Gi is 1,073,741,824 bytes
    const items = [
      vpa('gi', { memory: '1Gi' }),
      vpa('k', { memory: '262144k' }),
      vpa('mi', { memory: '100Mi' }),
    ];

    expect(sortedNames(columns, 'memory', items)).toEqual(['mi', 'k', 'gi']);
  });

  it('puts VPAs without a recommendation first', async () => {
    const columns = await renderColumns();
    const items = [vpa('recommended', { cpu: '25m', memory: '100Mi' }), vpa('pending')];

    expect(sortedNames(columns, 'cpu', items)).toEqual(['pending', 'recommended']);
    expect(sortedNames(columns, 'memory', items)).toEqual(['pending', 'recommended']);
  });
});
