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
import PDBDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/podDisruptionBudget', () => ({
  default: { kind: 'PodDisruptionBudget' },
}));

vi.mock('../common/Label', () => ({
  StatusLabel: ({ children }: any) => children,
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const pdb = {
  spec: { minAvailable: 2, maxUnavailable: 1 },
  selectors: ['app=nginx'],
  status: {
    disruptionsAllowed: 3,
    currentHealthy: 4,
    desiredHealthy: 4,
    expectedPods: 5,
  },
} as any;

describe('PDBDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the route params and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
        <PDBDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('my-pdb');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('includes the min/max, selector and status rows in extraInfo', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
        <PDBDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const names = props.extraInfo(pdb).map((f: any) => String(f.name).split('|').pop());

    expect(names).toContain('Max Unavailable');
    expect(names).toContain('Min Available');
    expect(names).toContain('Selector');
    expect(names).toContain('Status');
  });

  it('returns nothing from extraInfo when there is no item', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-pdb' }}>
        <PDBDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
  });
});
