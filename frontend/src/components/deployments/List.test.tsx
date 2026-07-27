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
import DeploymentsList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/deployment', () => ({
  default: { kind: 'Deployment' },
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

describe('DeploymentsList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('sorts by Pods column with missing replica fields (regression for #6691)', () => {
    // Regression test: when replicas or availableReplicas are undefined (Kubernetes
    // omits them when 0), the comparator used to produce NaN, breaking sort order.
    render(
      <TestContext>
        <DeploymentsList />
      </TestContext>
    );

    const podsColumn = getColumn('pods');
    expect(podsColumn).toBeDefined();
    expect(podsColumn.sort).toBeDefined();

    // Scaled-to-zero deployment: replicas and availableReplicas are undefined
    const scaledToZero = { status: {} } as any;
    // Partially available deployment
    const partiallyAvailable = { status: { replicas: 3, availableReplicas: 2 } } as any;
    // Fully available deployment
    const fullyAvailable = { status: { replicas: 5, availableReplicas: 5 } } as any;
    // Another scaled-to-zero
    const anotherZero = { status: {} } as any;

    const deployments = [partiallyAvailable, scaledToZero, fullyAvailable, anotherZero];

    // Sort ascending: scaled-to-zero should come first (0 < 2 < 5)
    const sortedAsc = [...deployments].sort(podsColumn.sort);
    expect(sortedAsc[0]).toBe(scaledToZero);
    expect(sortedAsc[1]).toBe(anotherZero);
    expect(sortedAsc[2]).toBe(partiallyAvailable);
    expect(sortedAsc[3]).toBe(fullyAvailable);

    // Sort descending: fully available should come first
    const sortedDesc = [...deployments].sort((a: any, b: any) => podsColumn.sort(b, a));
    expect(sortedDesc[0]).toBe(fullyAvailable);
    expect(sortedDesc[1]).toBe(partiallyAvailable);
    expect(sortedDesc[2]).toBe(scaledToZero);
    expect(sortedDesc[3]).toBe(anotherZero);

    // Verify no NaN in sort results (NaN !== NaN)
    sortedAsc.forEach((d: any, i: number) => {
      if (i > 0) {
        const compareResult = podsColumn.sort(sortedAsc[i - 1], d);
        expect(compareResult).not.toBeNaN();
      }
    });
  });

  it('sorts by Pods column using replicas as tiebreaker when availableReplicas match', () => {
    render(
      <TestContext>
        <DeploymentsList />
      </TestContext>
    );

    const podsColumn = getColumn('pods');

    // Both have same availableReplicas but different total replicas
    const deployment1 = { status: { replicas: 5, availableReplicas: 3 } } as any;
    const deployment2 = { status: { replicas: 10, availableReplicas: 3 } } as any;

    const sorted = [deployment2, deployment1].sort(podsColumn.sort);
    expect(sorted[0]).toBe(deployment1); // 5 replicas comes before 10
    expect(sorted[1]).toBe(deployment2);
  });

  it('handles mixed undefined and defined replica fields consistently', () => {
    render(
      <TestContext>
        <DeploymentsList />
      </TestContext>
    );

    const podsColumn = getColumn('pods');

    // Mix of undefined and defined fields
    const noReplicas = { status: {} } as any;
    const onlyAvailable = { status: { availableReplicas: 2 } } as any;
    const onlyReplicas = { status: { replicas: 3 } } as any;
    const both = { status: { replicas: 4, availableReplicas: 4 } } as any;

    const deployments = [both, onlyReplicas, onlyAvailable, noReplicas];
    const sorted = [...deployments].sort(podsColumn.sort);

    // Verify sorting is deterministic (run twice, should be identical)
    const sorted2 = [...deployments].sort(podsColumn.sort);
    expect(sorted).toEqual(sorted2);

    // Verify all comparisons produce valid numbers, not NaN
    for (let i = 0; i < sorted.length - 1; i++) {
      const compareResult = podsColumn.sort(sorted[i], sorted[i + 1]);
      expect(compareResult).not.toBeNaN();
      expect(typeof compareResult).toBe('number');
    }
  });
});
