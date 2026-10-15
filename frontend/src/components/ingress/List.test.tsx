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
import Ingress from '../../lib/k8s/ingress';
import { TestContext } from '../../test';
import IngressList, { getIngressPaths } from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/ingress', () => ({
  default: {
    kind: 'Ingress',
    className: 'Ingress',
    pluralName: 'ingresses',
    isNamespaced: true,
  },
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: any) => children,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function getColumn(id: string) {
  const props = mockListView.mock.calls[0][0];
  return props.columns.find((c: any) => c?.id === id);
}

function createMockIngress(rules: any[]): Ingress {
  return {
    getRules: () => rules,
  } as unknown as Ingress;
}

describe('IngressList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns with correct column IDs', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'name',
      'namespace',
      'cluster',
      'class',
      'hosts',
      'paths',
      'labels',
      'age',
    ]);
  });

  it('formats multiple hosts separated by comma and space', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([
      { host: 'foo.com' },
      { host: 'bar.com' },
      { host: undefined },
    ]);

    const hostsColumn = getColumn('hosts');
    expect(hostsColumn.getValue(ingress)).toBe('foo.com, bar.com, *');
  });

  it('extracts paths with numeric service port', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/api',
              backend: {
                service: {
                  name: 'api-service',
                  port: {
                    number: 8080,
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const pathsColumn = getColumn('paths');
    const value = pathsColumn.getValue(ingress);
    expect(value).toBe('/api › api-service:8080');
    expect(value).not.toBe('');
  });

  it('extracts paths with named service port', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/web',
              backend: {
                service: {
                  name: 'web-service',
                  port: {
                    name: 'http',
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const pathsColumn = getColumn('paths');
    const value = pathsColumn.getValue(ingress);
    expect(value).toBe('/web › web-service:http');
    expect(value).not.toBe('');
  });

  it('handles omitted/undefined service port safely without throwing', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/legacy',
              backend: {
                service: {
                  name: 'legacy-service',
                  // port object omitted / undefined
                } as any,
              },
            },
          ],
        },
      },
    ]);

    const pathsColumn = getColumn('paths');
    expect(() => pathsColumn.getValue(ingress)).not.toThrow();
    expect(pathsColumn.getValue(ingress)).toBe('/legacy › legacy-service:');
  });

  it('extracts paths with resource backend', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/storage',
              backend: {
                resource: {
                  apiVersion: 'v1',
                  kind: 'StorageBucket',
                  name: 'my-bucket',
                },
              },
            },
          ],
        },
      },
    ]);

    const pathsColumn = getColumn('paths');
    expect(pathsColumn.getValue(ingress)).toBe('/storage › StorageBucket:my-bucket');
  });

  it('joins multiple paths and multiple rules with comma and space', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/api',
              backend: {
                service: {
                  name: 'api-service',
                  port: { number: 8080 },
                },
              },
            },
            {
              path: '/users',
              backend: {
                service: {
                  name: 'user-service',
                  port: { number: 3000 },
                },
              },
            },
          ],
        },
      },
      {
        http: {
          paths: [
            {
              path: '/admin',
              backend: {
                service: {
                  name: 'admin-service',
                  port: { number: 9090 },
                },
              },
            },
          ],
        },
      },
    ]);

    const pathsColumn = getColumn('paths');
    expect(pathsColumn.getValue(ingress)).toBe(
      '/api › api-service:8080, /users › user-service:3000, /admin › admin-service:9090'
    );
  });

  it('allows matching specific ingress paths and backends in search filtering', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingressA = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/api/v1',
              backend: {
                service: {
                  name: 'orders-service',
                  port: { number: 8080 },
                },
              },
            },
          ],
        },
      },
    ]);

    const ingressB = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/auth/login',
              backend: {
                service: {
                  name: 'auth-service',
                  port: { number: 9000 },
                },
              },
            },
          ],
        },
      },
    ]);

    const pathsColumn = getColumn('paths');
    const valueA = pathsColumn.getValue(ingressA);
    const valueB = pathsColumn.getValue(ingressB);

    // Search query "/api" should match Ingress A but not Ingress B
    expect(valueA.includes('/api')).toBe(true);
    expect(valueB.includes('/api')).toBe(false);

    // Search query "auth-service" should match Ingress B but not Ingress A
    expect(valueA.includes('auth-service')).toBe(false);
    expect(valueB.includes('auth-service')).toBe(true);
  });

  it('handles ingress with empty rules array safely', () => {
    render(
      <TestContext>
        <IngressList />
      </TestContext>
    );

    const ingress = createMockIngress([]);
    const pathsColumn = getColumn('paths');
    const hostsColumn = getColumn('hosts');

    expect(pathsColumn.getValue(ingress)).toBe('');
    expect(hostsColumn.getValue(ingress)).toBe('');
  });
});

describe('getIngressPaths helper', () => {
  it('returns an array of formatted paths', () => {
    const ingress = createMockIngress([
      {
        http: {
          paths: [
            {
              path: '/api',
              backend: {
                service: {
                  name: 'api-service',
                  port: { number: 8080 },
                },
              },
            },
          ],
        },
      },
    ]);

    expect(getIngressPaths(ingress)).toEqual(['/api › api-service:8080']);
  });

  it('handles rules without http gracefully', () => {
    const ingress = createMockIngress([{ host: 'example.com' }]);
    expect(getIngressPaths(ingress)).toEqual(['']);
  });
});
