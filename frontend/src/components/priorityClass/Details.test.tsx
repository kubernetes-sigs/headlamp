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
import PriorityClassDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/priorityClass', () => ({
  default: { kind: 'PriorityClass' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const priorityClass = {
  value: 1000000,
  globalDefault: true,
  preemptionPolicy: 'PreemptLowerPriority',
  description: 'Mission Critical apps.',
} as any;

describe('PriorityClassDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the route name and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ name: 'high-priority-apps' }}>
        <PriorityClassDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('high-priority-apps');
    expect(props.withEvents).toBe(true);
  });

  it('maps the priority class fields into extraInfo', () => {
    render(
      <TestContext routerMap={{ name: 'high-priority-apps' }}>
        <PriorityClassDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(
      props.extraInfo(priorityClass).map((f: any) => [String(f.name).split('|').pop(), f.value])
    );

    expect(byName['Value']).toBe(1000000);
    expect(byName['Global Default']).toBe(true);
    expect(byName['Preemption Policy']).toBe('PreemptLowerPriority');
    expect(byName['Description']).toBe('Mission Critical apps.');
  });

  it('falls back to False when globalDefault is unset', () => {
    render(
      <TestContext routerMap={{ name: 'high-priority-apps' }}>
        <PriorityClassDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo({ ...priorityClass, globalDefault: false });
    const globalDefault = extraInfo.find((f: any) => f.name.includes('Global Default'));
    expect(globalDefault.value).toBe('False');
  });
});
