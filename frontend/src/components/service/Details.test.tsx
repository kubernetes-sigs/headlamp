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
import ServiceDetails from './Details';

const { mockDetailsGrid, mockPortForward } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockPortForward: vi.fn(),
}));

vi.mock('@iconify/react', () => ({
  InlineIcon: () => null,
}));

vi.mock('../../lib/k8s/service', () => ({
  default: { kind: 'Service' },
}));

vi.mock('../../lib/k8s/endpoints', () => ({
  default: { useList: () => [[], null] },
}));

vi.mock('../../lib/k8s/endpointSlices', () => ({
  default: { useList: () => [[], null] },
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: { useList: () => [[], null] },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  MetadataDictGrid: () => null,
}));

vi.mock('../common/Resource/PortForward', () => ({
  default: (props: any) => {
    mockPortForward(props);
    return null;
  },
}));

vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: ({ data, columns }: any) => (
    <div>
      {data.map((row: any, i: number) => (
        <div key={i}>
          {columns.map((col: any, j: number) => (
            <div key={j}>{col.getter ? col.getter(row) : row[col.datum]}</div>
          ))}
        </div>
      ))}
    </div>
  ),
}));

describe('ServiceDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockPortForward.mockReset();
  });

  it('falls back to port when targetPort is omitted in spec.ports', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-svc' }}>
        <ServiceDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const service = {
      metadata: { name: 'my-svc', namespace: 'default' },
      spec: {
        type: 'ClusterIP',
        ports: [{ port: 80, protocol: 'TCP' }],
      },
      getExternalAddresses: () => '',
    };

    const sections = props.extraSections(service);
    const portsSection = sections.find((s: any) => s.id === 'headlamp.service-ports');

    render(<TestContext>{portsSection.section}</TestContext>);

    expect(screen.getAllByText('80')).toHaveLength(2);
    expect(mockPortForward).toHaveBeenCalledWith(
      expect.objectContaining({ containerPort: 80, resource: service })
    );
  });

  it('does not crash when spec is undefined', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'my-svc' }}>
        <ServiceDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const service = {
      metadata: { name: 'my-svc', namespace: 'default' },
      getExternalAddresses: () => '',
    };

    expect(() => props.extraInfo(service)).not.toThrow();
    expect(() => props.extraSections(service)).not.toThrow();
  });
});
