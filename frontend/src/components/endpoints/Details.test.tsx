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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';

const { mockDetailsGrid, mockSimpleTable } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockSimpleTable: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => <span>{children}</span>,
}));

vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children, title }: any) => (
    <div>
      {title}
      {children}
    </div>
  ),
}));

vi.mock('../common/SectionHeader', () => ({
  default: ({ title }: any) => <h4>{title}</h4>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: (props: any) => {
    mockSimpleTable(props);
    return (
      <div data-testid={`table-${props.reflectInURL}`}>
        {(props.data || []).map((row: any, i: number) => (
          <div key={i}>
            {props.columns.map((col: any) => (col.getter ? col.getter(row) : row[col.datum]))}
          </div>
        ))}
      </div>
    );
  },
}));

vi.mock('../../lib/k8s', () => ({ ResourceClasses: {} }));

vi.mock('../../lib/k8s/endpoints', () => ({
  default: vi.fn(),
  __esModule: true,
}));

vi.mock('../../lib/k8s/cluster', () => ({}));

// Must import after mocks are set up.
const { default: EndpointDetails } = await import('./Details');

const fakeEndpoint: any = {
  subsets: [
    {
      addresses: [{ ip: '10.0.0.1' }, { ip: '10.0.0.2' }],
      notReadyAddresses: [
        { ip: '10.0.0.9', targetRef: { kind: 'Pod', name: 'not-ready-pod', namespace: 'default' } },
      ],
      ports: [{ name: 'http', port: 80, protocol: 'TCP' }],
    },
    {
      addresses: [{ ip: '10.0.1.1' }],
      notReadyAddresses: [],
      ports: [{ name: 'http', port: 81, protocol: 'TCP' }],
    },
  ],
};

/**
 * Renders EndpointDetails to capture the extraSections it hands to DetailsGrid,
 * then renders the returned subsets section so its child tables are mounted.
 */
function renderSubsetsSection() {
  render(
    <TestContext routerMap={{ namespace: 'default', name: 'my-endpoint' }}>
      <EndpointDetails />
    </TestContext>
  );

  expect(mockDetailsGrid).toHaveBeenCalled();
  const { extraSections } = mockDetailsGrid.mock.calls[mockDetailsGrid.mock.calls.length - 1][0];
  const sections = extraSections(fakeEndpoint);

  return render(<TestContext>{sections[0].section}</TestContext>);
}

describe('EndpointDetails subsets section', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockSimpleTable.mockReset();
  });

  it('renders notReadyAddresses rows, including their target name', () => {
    renderSubsetsSection();

    const notReadyRow = screen.getByTestId('table-not-ready-addresses-0');
    expect(notReadyRow).toHaveTextContent('10.0.0.9');
    expect(notReadyRow).toHaveTextContent('not-ready-pod');
  });

  it('gives every subset table its own URL key, keyed by subset index', () => {
    renderSubsetsSection();

    const reflectInURLValues = mockSimpleTable.mock.calls.map(([props]) => props.reflectInURL);

    expect(reflectInURLValues).toEqual([
      'addresses-0',
      'not-ready-addresses-0',
      'ports-0',
      'addresses-1',
      'not-ready-addresses-1',
      'ports-1',
    ]);
    // No two subsets should be able to collide on the same URL-backed state.
    expect(new Set(reflectInURLValues).size).toBe(reflectInURLValues.length);
  });
});
