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
import { LeaseDetails } from './Details';
import { LEASE_DUMMY_DATA } from './storyHelper';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/lease', () => ({
  Lease: { kind: 'Lease' },
}));

vi.mock('../common/Label', () => ({
  DateLabel: () => null,
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const lease = LEASE_DUMMY_DATA[0] as any;

describe('LeaseDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the Lease resource type and route params to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'lease' }}>
        <LeaseDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('lease');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('builds extraInfo from the lease spec', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'lease' }}>
        <LeaseDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(lease);
    const byName = Object.fromEntries(extraInfo.map((f: any) => [f.name, f.value]));

    expect(byName['Holder Identity']).toBe('holder');
    expect(byName['Lease Duration Seconds']).toBe(10);
    expect(byName['Renew Time']).toBeDefined();
  });

  it('returns nothing from extraInfo when there is no item', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'lease' }}>
        <LeaseDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.extraInfo(null)).toBeFalsy();
  });
});
