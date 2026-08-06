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

import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

const { mockDetailsGrid, mockMetadataDictGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockMetadataDictGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  MetadataDictGrid: (props: any) => {
    mockMetadataDictGrid(props);
    return null;
  },
}));

vi.mock('../../lib/k8s/limitRange', () => ({
  LimitRange: {
    kind: 'LimitRange',
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { TestContext } from '../../test';
import { LimitRangeDetails } from './Details';

describe('LimitRangeDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockMetadataDictGrid.mockReset();
  });

  it('passes limit range specific configuration to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'limit-range' }}>
        <LimitRangeDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();

    const props = mockDetailsGrid.mock.calls[0][0];

    expect(props.resourceType.kind).toBe('LimitRange');
    expect(props.withEvents).toBe(true);
    expect(typeof props.extraInfo).toBe('function');
  });

  it('provides a Limits section through extraInfo', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'limit-range' }}>
        <LimitRangeDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const fakeLimitRange: any = {
      jsonData: {
        spec: {
          limits: [
            {
              type: 'Container',
              default: {
                cpu: '100m',
                memory: '128Mi',
              },
              defaultRequest: {
                cpu: '50m',
                memory: '64Mi',
              },
              max: {
                cpu: '500m',
                memory: '1Gi',
              },
              min: {
                cpu: '10m',
                memory: '4Mi',
              },
            },
          ],
        },
      },
    };

    const extraInfo = props.extraInfo(fakeLimitRange);

    expect(extraInfo).toHaveLength(1);
    expect(extraInfo[0].name).toContain('Limits');
    expect(extraInfo[0].value).toBeDefined();
  });

  it('shows every entry in spec.limits, not just the first one', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'limit-range' }}>
        <LimitRangeDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const fakeLimitRange: any = {
      jsonData: {
        spec: {
          limits: [
            { type: 'Container', default: { cpu: '100m' }, defaultRequest: {}, max: {}, min: {} },
            { type: 'Pod', default: { cpu: '2' }, defaultRequest: {}, max: {}, min: {} },
          ],
        },
      },
    };

    const extraInfo = props.extraInfo(fakeLimitRange);

    expect(extraInfo).toHaveLength(2);

    render(<>{extraInfo[0].value}</>);
    render(<>{extraInfo[1].value}</>);

    const defaultDicts = mockMetadataDictGrid.mock.calls.map(call => call[0].dict);
    expect(defaultDicts).toContainEqual({ cpu: '100m' });
    expect(defaultDicts).toContainEqual({ cpu: '2' });
  });

  it('returns an empty array when spec.limits is empty', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'limit-range' }}>
        <LimitRangeDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const fakeLimitRange: any = { jsonData: { spec: { limits: [] } } };

    expect(props.extraInfo(fakeLimitRange)).toEqual([]);
  });

  it('includes all container limit subsections in the extraInfo content', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'limit-range' }}>
        <LimitRangeDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const fakeLimitRange: any = {
      jsonData: {
        spec: {
          limits: [
            {
              default: {},
              defaultRequest: {},
              max: {},
              min: {},
            },
          ],
        },
      },
    };

    const extraInfo = props.extraInfo(fakeLimitRange);

    render(<>{extraInfo[0].value}</>);

    expect(screen.getByText('translation|Default')).toBeInTheDocument();
    expect(screen.getByText('translation|Default Request')).toBeInTheDocument();
    expect(screen.getByText('translation|Max')).toBeInTheDocument();
    expect(screen.getByText('translation|Min')).toBeInTheDocument();
  });

  it('returns a falsy value when no limit range resource is available', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'limit-range' }}>
        <LimitRangeDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    expect(props.extraInfo(null)).toBeNull();
  });
});
