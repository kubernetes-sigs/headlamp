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
import { vi } from 'vitest';
import { TestContext } from '../../test';
import IngressDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

vi.mock('../../lib/k8s/ingress', () => ({
  default: { kind: 'Ingress' },
}));

const fakeIngress: any = {
  cluster: 'cluster-1',
  spec: {
    tls: [
      {
        hosts: ['example.com'],
        secretName: 'tls-secret',
      },
    ],
    ingressClassName: 'nginx',
    defaultBackend: {
      service: {
        name: 'backend-service',
        port: {
          number: 80,
        },
      },
    },
  },
  getAddresses: () => '10.0.0.1',
  getRules: () => [
    {
      http: {
        paths: [
          {
            backend: {
              service: {
                name: 'service1',
                port: {
                  number: 8080,
                },
              },
            },
          },
        ],
      },
    },
  ],
};

const resourceIngress: any = {
  cluster: 'cluster-1',
  spec: {},
  getAddresses: () => '',
  getRules: () => [
    {
      host: 'example.com',
      http: {
        paths: [
          {
            path: '/',
            backend: {
              resource: {
                kind: 'Service',
                name: 'service1',
              },
            },
          },
        ],
      },
    },
  ],
};

describe('IngressDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('provides ingress-specific extraInfo fields to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-ingress' }}>
        <IngressDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const extraInfo = props.extraInfo(fakeIngress);

    const fieldNames = extraInfo.map((f: any) => f.name);

    expect(fieldNames.some((n: string) => n.includes('Address'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Default Backend'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Ports'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('TLS'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Class Name'))).toBe(true);
  });

  it('includes TLS configuration in extraInfo when TLS is configured', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-ingress' }}>
        <IngressDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const extraInfo = props.extraInfo(fakeIngress);

    const tlsField = extraInfo.find((f: any) => f.name.includes('TLS'));

    expect(tlsField).toBeDefined();
    expect(tlsField.hide).not.toBe(true);

    const labels = (tlsField.value as any)?.props?.labels;

    expect(labels).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tls-secret'),
        expect.stringContaining('example.com'),
      ])
    );
  });

  it('provides rules section for ingress resources', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-ingress' }}>
        <IngressDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];

    const sections = props.extraSections(resourceIngress);

    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('headlamp.ingress-rules');
    expect(sections[0].section).toBeTruthy();
  });
});
