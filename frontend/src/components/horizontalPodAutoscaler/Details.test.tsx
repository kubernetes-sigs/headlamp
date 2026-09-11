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

// Interpolates {{ placeholders }} like real i18next, so tests can assert on
// the substituted value rather than just the raw translation key.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, any>) => {
      const resolved = opts
        ? Object.entries(opts).reduce(
            (str, [name, value]) => str.replaceAll(`{{ ${name} }}`, String(value)),
            key
          )
        : key;
      return resolved.split('|').pop() ?? resolved;
    },
  }),
}));

const hpa = {
  referenceObject: { kind: 'Deployment', metadata: { name: 'web' } },
  metrics: () => [{ definition: 'cpu', value: '50%/80%' }],
  spec: { minReplicas: 1, maxReplicas: 5, scaleTargetRef: { kind: 'Deployment', name: 'web' } },
  status: { currentReplicas: 2, desiredReplicas: 3, lastScaleTime: undefined },
  jsonData: {},
} as any;

const statefulSetHpa = {
  ...hpa,
  referenceObject: { kind: 'StatefulSet', metadata: { name: 'db' } },
  spec: { ...hpa.spec, scaleTargetRef: { kind: 'StatefulSet', name: 'db' } },
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
    const byName = Object.fromEntries(props.extraInfo(hpa).map((f: any) => [f.name, f.value]));

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

  it('labels the pods row with the scale target kind', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-hpa' }}>
        <HpaDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    expect(props.extraInfo(hpa).some((f: any) => f.name === 'Deployment pods')).toBe(true);
    expect(props.extraInfo(statefulSetHpa).some((f: any) => f.name === 'StatefulSet pods')).toBe(
      true
    );
  });
});
