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
import EndpointSlice from '../../lib/k8s/endpointSlices';
import { TestContext } from '../../test';
import EndpointSliceList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

vi.mock('../common/Label', () => ({
  StatusLabel: ({ children, status }: any) => (
    <span data-testid="status-label" data-status={status}>
      {children}
    </span>
  ),
}));

describe('EndpointSliceList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders with the EndpointSlice resource class and expected columns', () => {
    render(
      <TestContext>
        <EndpointSliceList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    expect(props.resourceClass).toBe(EndpointSlice);
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'name',
      'namespace',
      'cluster',
      'endpoints',
      'ports',
      'addressType',
      'labels',
      'age',
    ]);
  });

  it('renders endpoints with StatusLabel when addresses and conditions exist', () => {
    render(
      <TestContext>
        <EndpointSliceList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const endpointCol = props.columns.find((c: any) => c?.id === 'endpoints');

    const slice = new EndpointSlice({
      kind: 'EndpointSlice',
      apiVersion: 'discovery.k8s.io/v1',
      metadata: {
        name: 'my-slice',
        namespace: 'default',
        creationTimestamp: '2023-01-01T00:00:00Z',
        uid: 'uid-123',
      },
      endpoints: [
        { addresses: ['10.0.0.1', '10.0.0.2'], conditions: { ready: true } } as any,
        { addresses: ['10.0.0.3'], conditions: { ready: false } } as any,
      ],
    });

    expect(endpointCol.getValue(slice)).toBe('10.0.0.1\n10.0.0.2\n10.0.0.3');

    const { getAllByTestId } = render(<div>{endpointCol.render(slice)}</div>);
    const labels = getAllByTestId('status-label');
    expect(labels).toHaveLength(2);
    expect(labels[0]).toHaveTextContent('10.0.0.1,10.0.0.2');
    expect(labels[0].getAttribute('data-status')).toBe('success');
    expect(labels[1]).toHaveTextContent('10.0.0.3');
    expect(labels[1].getAttribute('data-status')).toBe('error');
  });

  it('handles endpoints with undefined addresses safely without throwing', () => {
    render(
      <TestContext>
        <EndpointSliceList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const endpointCol = props.columns.find((c: any) => c?.id === 'endpoints');

    const slice = new EndpointSlice({
      kind: 'EndpointSlice',
      apiVersion: 'discovery.k8s.io/v1',
      metadata: {
        name: 'my-slice',
        namespace: 'default',
        creationTimestamp: '2023-01-01T00:00:00Z',
        uid: 'uid-123',
      },
      endpoints: [{ conditions: { ready: true } } as any],
    });

    expect(endpointCol.getValue(slice)).toBe('');
    expect(endpointCol.render(slice)).toEqual([null]);
  });

  it('handles endpoint slice with undefined endpoints safely', () => {
    render(
      <TestContext>
        <EndpointSliceList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const endpointCol = props.columns.find((c: any) => c?.id === 'endpoints');

    const slice = new EndpointSlice({
      kind: 'EndpointSlice',
      apiVersion: 'discovery.k8s.io/v1',
      metadata: {
        name: 'my-slice',
        namespace: 'default',
        creationTimestamp: '2023-01-01T00:00:00Z',
        uid: 'uid-123',
      },
    });

    expect(endpointCol.getValue(slice)).toBe('');
    expect(endpointCol.render(slice)).toBeNull();

    const specSpy = vi.spyOn(slice, 'spec', 'get').mockReturnValue(undefined as any);
    try {
      expect(endpointCol.getValue(slice)).toBe('');
      expect(endpointCol.render(slice)).toBeNull();
    } finally {
      specSpy.mockRestore();
    }
  });
});
