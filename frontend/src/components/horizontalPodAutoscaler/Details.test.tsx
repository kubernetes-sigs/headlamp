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
import HpaDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/hpa', () => ({
  default: { kind: 'HorizontalPodAutoscaler' },
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => children,
}));

vi.mock('../common/SimpleTable', () => ({
  default: () => null,
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  ConditionsSection: () => null,
}));

const hpa = {
  referenceObject: { kind: 'Deployment', metadata: { name: 'web' } },
  metrics: () => [{ definition: 'cpu', value: '50%/80%' }],
  spec: { minReplicas: 1, maxReplicas: 5 },
  status: { currentReplicas: 2, desiredReplicas: 3, lastScaleTime: undefined },
  jsonData: {},
} as any;

describe('HpaDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes the route params and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-hpa' }}>
        <HpaDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('my-hpa');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('exposes the min/max replicas in extraInfo', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-hpa' }}>
        <HpaDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(
      props.extraInfo(hpa).map((f: any) => [String(f.name).split('|').pop(), f.value])
    );

    expect(byName['MinReplicas']).toBe(1);
    expect(byName['MaxReplicas']).toBe(5);
  });

  it('hides the Last Scale Time row when there is no scale time', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-hpa' }}>
        <HpaDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const lastScale = props.extraInfo(hpa).find((f: any) => f.name.includes('Last Scale Time'));
    expect(lastScale.hide).toBe(true);
  });
});
