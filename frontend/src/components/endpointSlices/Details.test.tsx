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
import { TestContext } from '../../test';
import EndpointSliceDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

vi.mock('../../lib/k8s/endpointSlices', () => ({
  default: { kind: 'EndpointSlice' },
}));

const mockEndpointSlice: any = {
  jsonData: {
    addressType: 'IPv4',
    endpoints: [
      {
        addresses: ['10.244.0.10'],
        conditions: {
          ready: true,
          serving: true,
          terminating: false,
        },
      },
    ],
    ports: [
      {
        name: 'http',
        port: 8080,
        protocol: 'TCP',
      },
    ],
  },
  spec: {
    addressType: 'IPv4',
    endpoints: [
      {
        addresses: ['10.244.0.10'],
        conditions: {
          ready: true,
          serving: true,
          terminating: false,
        },
      },
    ],
    ports: [
      {
        name: 'http',
        port: 8080,
        protocol: 'TCP',
      },
    ],
  },
};

describe('EndpointSliceDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('provides EndpointSlice-specific extraInfo fields to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-endpointslice' }}>
        <EndpointSliceDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];

    const extraInfo = props.extraInfo(mockEndpointSlice);
    const addressTypeField = extraInfo.find((f: any) => String(f.name).includes('Address Type'));
    expect(addressTypeField).toBeDefined();
    expect(addressTypeField?.value).toBe('IPv4');
  });

  it('provides extraSections for endpoints and ports', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-endpointslice' }}>
        <EndpointSliceDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections(mockEndpointSlice);

    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe('headlamp.endpoint-slice-endpoints');
    expect(sections[1].id).toBe('headlamp.endpoint-slice-ports');
  });

  it('renders healthy endpoint conditions with terminating not as an error', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-endpointslice' }}>
        <EndpointSliceDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections(mockEndpointSlice);
    const endpointsTable = sections[0].section.props.children;
    const conditionsColumn = endpointsTable.props.columns.find(
      (c: any) => c.label === 'Conditions'
    );

    const healthyEndpoint = {
      addresses: ['10.244.0.10'],
      conditions: {
        ready: true,
        serving: true,
        terminating: false,
      },
    };

    const renderedConditions = conditionsColumn.getter(healthyEndpoint);
    const { container } = render(<TestContext>{renderedConditions}</TestContext>);

    const labels = container.querySelectorAll('span');
    const readyLabel = Array.from(labels).find(el => el.textContent === 'Ready');
    const servingLabel = Array.from(labels).find(el => el.textContent === 'Serving');
    const terminatingLabel = Array.from(labels).find(el => el.textContent === 'Terminating');

    expect(readyLabel).toBeDefined();
    expect(servingLabel).toBeDefined();
    expect(terminatingLabel).toBeDefined();

    // Terminating should not have error styling when terminating: false
    expect(screen.getByText('Terminating')).toBeInTheDocument();
  });

  it('renders terminating condition with warning status when terminating is true', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-endpointslice' }}>
        <EndpointSliceDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections(mockEndpointSlice);
    const endpointsTable = sections[0].section.props.children;
    const conditionsColumn = endpointsTable.props.columns.find(
      (c: any) => c.label === 'Conditions'
    );

    const terminatingEndpoint = {
      addresses: ['10.244.0.11'],
      conditions: {
        ready: false,
        serving: false,
        terminating: true,
      },
    };

    const renderedConditions = conditionsColumn.getter(terminatingEndpoint);
    render(<TestContext>{renderedConditions}</TestContext>);

    expect(screen.getByText('Terminating')).toBeInTheDocument();
  });

  it('renders safely without throwing when conditions is undefined', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-endpointslice' }}>
        <EndpointSliceDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections(mockEndpointSlice);
    const endpointsTable = sections[0].section.props.children;
    const conditionsColumn = endpointsTable.props.columns.find(
      (c: any) => c.label === 'Conditions'
    );

    const endpointWithoutConditions = {
      addresses: ['192.168.1.50'],
    };

    expect(() => {
      const renderedConditions = conditionsColumn.getter(endpointWithoutConditions);
      render(<TestContext>{renderedConditions}</TestContext>);
    }).not.toThrow();

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Serving')).toBeInTheDocument();
    expect(screen.getByText('Terminating')).toBeInTheDocument();
  });

  it('renders safely with partial conditions', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-endpointslice' }}>
        <EndpointSliceDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections(mockEndpointSlice);
    const endpointsTable = sections[0].section.props.children;
    const conditionsColumn = endpointsTable.props.columns.find(
      (c: any) => c.label === 'Conditions'
    );

    const partialEndpoint = {
      addresses: ['10.244.0.12'],
      conditions: {
        ready: true,
      },
    };

    expect(() => {
      const renderedConditions = conditionsColumn.getter(partialEndpoint);
      render(<TestContext>{renderedConditions}</TestContext>);
    }).not.toThrow();

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });
});
