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
import VpaDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/vpa', () => ({
  default: { kind: 'VerticalPodAutoscaler' },
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => <a href="/reference">{children}</a>,
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

vi.mock('../common/SectionBox', () => ({
  default: ({ children }: any) => <div>{children}</div>,
  SectionBox: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: ({ data, columns }: any) => (
    <div>
      {(data ?? []).map((row: any, i: number) => (
        <div key={i}>
          {columns.map((col: any, j: number) => (
            <div key={j}>{col.getter ? col.getter(row) : row[col.datum]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe('VpaDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('renders a raw target reference as plain text after a group mismatch', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-vpa' }}>
        <VpaDetails />
      </TestContext>
    );
    const props = mockDetailsGrid.mock.calls[0][0];
    const reference = props
      .extraInfo({
        referenceObject: null,
        spec: {
          targetRef: {
            apiVersion: 'example.com/v1',
            kind: 'Deployment',
            name: 'custom-deployment',
          },
        },
      })
      .find((field: any) => field.name.includes('Reference'));

    expect(reference.value).toBe('Deployment/custom-deployment');
  });

  it('does not throw when containerPolicies omits controlledResources', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-vpa' }}>
        <VpaDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const vpa = {
      spec: {
        resourcePolicy: {
          containerPolicies: [{ containerName: '*', minAllowed: { cpu: '100m' } }],
        },
      },
    };

    const sections = props.extraSections(vpa);
    const policySection = sections.find((s: any) => s.id === 'headlamp.vpa-container-policy');

    expect(() => render(<TestContext>{policySection.section}</TestContext>)).not.toThrow();
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('handles missing resourcePolicy without crashing', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-vpa' }}>
        <VpaDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections({ spec: {} });
    const policySection = sections.find((s: any) => s.id === 'headlamp.vpa-container-policy');

    expect(policySection.section.props.children.props.data).toEqual([]);
    expect(() => render(<TestContext>{policySection.section}</TestContext>)).not.toThrow();
  });
});
