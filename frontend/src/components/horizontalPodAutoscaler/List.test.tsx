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

import '../../lib/router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import HPA from '../../lib/k8s/hpa';
import { TestContext } from '../../test';
import HpaList from './List';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockListView, mockItems } = vi.hoisted(() => ({
  mockListView: vi.fn(),
  mockItems: { current: [] as any[] },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return (
      <table>
        <tbody>
          {mockItems.current.map((item, rowIndex) => (
            <tr key={rowIndex}>
              {props.columns.map((col: any, colIndex: number) => {
                if (typeof col === 'string') {
                  return null;
                }
                const cellContent = col.render ? col.render(item) : col.getValue?.(item);
                return (
                  <td key={col.id ?? colIndex} data-testid={`row-${rowIndex}-col-${col.id}`}>
                    {cellContent}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  },
}));

function getColumn(id: string) {
  const props = mockListView.mock.calls[0][0];
  return props.columns.find((c: any) => c?.id === id);
}

function makeHpa(overrides: Record<string, any> = {}, cluster?: string) {
  return new HPA(
    {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: 'test-hpa',
        namespace: 'default',
        ...(overrides.metadata || {}),
      },
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: 'web',
        },
        metrics: [
          {
            type: 'Resource',
            resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } },
          },
        ],
        ...(overrides.spec || {}),
      },
      status: {
        currentReplicas: 2,
        desiredReplicas: 2,
        currentMetrics: [
          {
            type: 'Resource',
            resource: { name: 'cpu', current: { averageUtilization: 50, averageValue: '500m' } },
          },
        ],
        ...(overrides.status || {}),
      },
      ...overrides,
    } as any,
    cluster
  );
}

let queryClient: QueryClient;

function renderHpaList(items: any[] = []) {
  mockItems.current = items;
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <HpaList />
      </TestContext>
    </QueryClientProvider>
  );
}

const hpa = makeHpa({
  spec: {
    minReplicas: 1,
    maxReplicas: 5,
    scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
    metrics: [
      {
        type: 'Resource',
        resource: { name: 'cpu', target: { type: 'Utilization', averageUtilization: 80 } },
      },
      {
        type: 'Pods',
        pods: { metric: { name: 'packets' }, target: { type: 'AverageValue', averageValue: '20' } },
      },
    ],
  },
  status: {
    currentReplicas: 2,
    desiredReplicas: 2,
    currentMetrics: [
      {
        type: 'Resource',
        resource: { name: 'cpu', current: { averageUtilization: 50, averageValue: '500m' } },
      },
      {
        type: 'Pods',
        pods: { metric: { name: 'packets' }, current: { averageValue: '10' } },
      },
    ],
  },
});

describe('HpaList', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockListView.mockReset();
    mockItems.current = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', originalPath);
  });

  it('renders the expected columns', () => {
    renderHpaList();

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual([
      'name',
      'namespace',
      'cluster',
      'reference',
      'targets',
      'minReplicas',
      'maxReplicas',
      'currentReplicas',
      'labels',
      'age',
    ]);
  });

  it('reads reference, replicas and joined target values from the item', () => {
    renderHpaList();

    expect(getColumn('reference').getValue(hpa)).toBe('web');
    expect(getColumn('minReplicas').getValue(hpa)).toBe(1);
    expect(getColumn('maxReplicas').getValue(hpa)).toBe(5);
    expect(getColumn('currentReplicas').getValue(hpa)).toBe(2);
    expect(getColumn('targets').getValue(hpa)).toBe('50% /80%, 10/20');
  });

  it('safely handles resources with undefined status and spec without throwing', () => {
    const emptyHpa = new HPA({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: 'empty-hpa', namespace: 'default' },
    } as any);

    renderHpaList([emptyHpa]);

    expect(getColumn('reference').getValue(emptyHpa)).toBeUndefined();
    expect(getColumn('minReplicas').getValue(emptyHpa)).toBeUndefined();
    expect(getColumn('maxReplicas').getValue(emptyHpa)).toBeUndefined();
    expect(getColumn('currentReplicas').getValue(emptyHpa)).toBe(0);
    expect(getColumn('targets').getValue(emptyHpa)).toBe('');
    expect(getColumn('reference').render(emptyHpa)).toBeNull();
    expect(screen.getByTestId('row-0-col-reference')).toBeEmptyDOMElement();
  });

  it.each([
    {
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      name: 'web',
      namespace: 'default',
      expectedHref: '/c/minikube/deployments/default/web',
    },
    {
      kind: 'StatefulSet',
      apiVersion: 'apps/v1',
      name: 'database',
      namespace: 'data',
      expectedHref: '/c/minikube/statefulsets/data/database',
    },
    {
      kind: 'ReplicaSet',
      apiVersion: 'apps/v1',
      name: 'backend',
      namespace: 'api',
      expectedHref: '/c/minikube/replicasets/api/backend',
    },
  ])(
    'renders a working link for built-in target $kind/$name with namespace preserved',
    ({ kind, apiVersion, name, namespace, expectedHref }) => {
      window.history.replaceState({}, '', '/c/minikube/workloads');
      const targetHpa = makeHpa({
        metadata: { name: `hpa-${name}`, namespace },
        spec: {
          minReplicas: 1,
          maxReplicas: 5,
          scaleTargetRef: { apiVersion, kind, name },
        },
      });

      renderHpaList([targetHpa]);

      const link = screen.getByRole('link', { name: `${kind}/${name}` });
      expect(link).toHaveAttribute('href', expectedHref);
      expect(getColumn('reference').getValue(targetHpa)).toBe(name);
    }
  );

  it('preserves source cluster and namespace in multi-cluster links for built-in targets', () => {
    window.history.replaceState({}, '', '/c/primary+secondary/workloads');
    const multiClusterHpa = makeHpa(
      {
        metadata: { name: 'web-hpa', namespace: 'payments' },
        spec: {
          minReplicas: 1,
          maxReplicas: 5,
          scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
        },
      },
      'secondary'
    );

    renderHpaList([multiClusterHpa]);

    const link = screen.getByRole('link', { name: 'Deployment/web' });
    expect(link).toHaveAttribute('href', '/c/secondary+primary/deployments/payments/web');
  });

  it.each([
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'Rollout', name: 'checkout' },
    { apiVersion: 'keda.sh/v1alpha1', kind: 'ScaledObject', name: 'orders-scaler' },
  ])(
    'renders plain-text reference and column value for unregistered target $kind/$name',
    ({ apiVersion, kind, name }) => {
      const customHpa = makeHpa({
        spec: {
          minReplicas: 1,
          maxReplicas: 5,
          scaleTargetRef: { apiVersion, kind, name },
        },
      });

      expect(customHpa.referenceObject).toBeNull();

      renderHpaList([customHpa]);

      const cell = screen.getByTestId('row-0-col-reference');
      expect(cell).toHaveTextContent(`${kind}/${name}`);
      expect(screen.queryByRole('link')).toBeNull();
      expect(getColumn('reference').getValue(customHpa)).toBe(name);
    }
  );

  it('keeps valid target visible as plain text when referenceObject is null', () => {
    const hpaWithNullReference = {
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
      },
      referenceObject: null,
      metrics: () => [],
    } as any;

    renderHpaList([hpaWithNullReference]);

    const cell = screen.getByTestId('row-0-col-reference');
    expect(cell).toHaveTextContent('Deployment/web');
    expect(screen.queryByRole('link')).toBeNull();
    expect(getColumn('reference').getValue(hpaWithNullReference)).toBe('web');
  });

  it.each([
    { label: 'missing scaleTargetRef', spec: { minReplicas: 1, maxReplicas: 5 } },
    {
      label: 'empty kind and name',
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: '', kind: '', name: '' },
      },
    },
    {
      label: 'missing kind',
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: 'argoproj.io/v1alpha1', kind: '', name: 'checkout' },
      },
    },
    {
      label: 'missing name on custom kind',
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: 'argoproj.io/v1alpha1', kind: 'Rollout', name: '' },
      },
    },
    {
      label: 'missing name on built-in kind',
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: '' },
      },
    },
  ])('handles $label gracefully without malformed labels or links', ({ spec }) => {
    const incompleteHpa = new HPA({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: 'incomplete-hpa', namespace: 'default' },
      spec,
    } as any);

    renderHpaList([incompleteHpa]);

    expect(getColumn('reference').getValue(incompleteHpa)).toBeUndefined();
    expect(getColumn('reference').render(incompleteHpa)).toBeNull();
    expect(screen.getByTestId('row-0-col-reference')).toBeEmptyDOMElement();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
