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
import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import HPA from '../../lib/k8s/hpa';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { NameValueTable } from '../common/SimpleTable';
import HpaDetails from './Details';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockDetailsGrid, mockItem } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
  mockItem: { current: null as any },
}));

vi.mock('../common/SimpleTable', async importOriginal => {
  const actual = await importOriginal<typeof import('../common/SimpleTable')>();
  return {
    ...actual,
    default: () => null,
  };
});

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    const rows = mockItem.current ? props.extraInfo?.(mockItem.current) || [] : [];
    return <NameValueTable rows={rows} />;
  },
  ConditionsSection: () => null,
}));

const theme = createMuiTheme({ base: 'light', name: 'light' });

function makeHpa(overrides: Record<string, any> = {}, cluster?: string) {
  return new HPA(
    {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: 'my-hpa',
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
        metrics: [],
        ...(overrides.spec || {}),
      },
      status: {
        currentReplicas: 2,
        desiredReplicas: 3,
        lastScaleTime: undefined,
        ...(overrides.status || {}),
      },
      ...overrides,
    } as any,
    cluster
  );
}

let queryClient: QueryClient;

function renderHpaDetails(item: any = null, cluster?: string) {
  mockItem.current = item;
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext routerMap={{ namespace: 'default', name: 'my-hpa' }}>
        <ThemeProvider theme={theme}>
          <HpaDetails cluster={cluster} />
        </ThemeProvider>
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
    ],
  },
  status: { currentReplicas: 2, desiredReplicas: 3, lastScaleTime: undefined },
});

describe('HpaDetails', () => {
  const originalPath = window.location.pathname;

  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockItem.current = null;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
    window.history.replaceState({}, '', originalPath);
  });

  it('passes the route params and withEvents to DetailsGrid', () => {
    renderHpaDetails();

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('my-hpa');
    expect(props.namespace).toBe('default');
    expect(props.withEvents).toBe(true);
  });

  it('exposes the min/max replicas in extraInfo', () => {
    renderHpaDetails(hpa);

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(
      props.extraInfo(hpa).map((f: any) => [String(f.name).split('|').pop(), f.value])
    );

    expect(byName['MinReplicas']).toBe(1);
    expect(byName['MaxReplicas']).toBe(5);
  });

  it('hides the Last Scale Time row when there is no scale time', () => {
    renderHpaDetails(hpa);

    const props = mockDetailsGrid.mock.calls[0][0];
    const lastScale = props.extraInfo(hpa).find((f: any) => f.name.includes('Last Scale Time'));
    expect(lastScale.hide).toBe(true);
  });

  it('safely handles resources with undefined status and spec in extraInfo', () => {
    const emptyHpa = new HPA({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: 'empty-hpa', namespace: 'default' },
    } as any);

    renderHpaDetails(emptyHpa);

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraRows = props.extraInfo(emptyHpa);
    expect(extraRows).toBeDefined();

    const byName = Object.fromEntries(
      extraRows.map((f: any) => [String(f.name).split('|').pop(), f])
    );

    expect(byName['MinReplicas'].value).toBeUndefined();
    expect(byName['MaxReplicas'].value).toBeUndefined();
    expect(byName['Deployment pods'].value).toBe('0 current / 0 desired');
    expect(byName['Last Scale Time'].hide).toBe(true);
    expect(byName['Reference'].value).toBe('-');
    expect(screen.getByText('Reference').nextElementSibling).toHaveTextContent('-');
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
        metadata: { name: 'my-hpa', namespace },
        spec: {
          minReplicas: 1,
          maxReplicas: 5,
          scaleTargetRef: { apiVersion, kind, name },
        },
      });

      renderHpaDetails(targetHpa);

      const link = screen.getByRole('link', { name: `${kind}/${name}` });
      expect(link).toHaveAttribute('href', expectedHref);
    }
  );

  it('preserves source cluster and namespace in multi-cluster links for built-in targets', () => {
    window.history.replaceState({}, '', '/c/primary+secondary/workloads');
    const multiClusterHpa = makeHpa(
      {
        metadata: { name: 'my-hpa', namespace: 'payments' },
        spec: {
          minReplicas: 1,
          maxReplicas: 5,
          scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
        },
      },
      'secondary'
    );

    renderHpaDetails(multiClusterHpa, 'secondary');

    const link = screen.getByRole('link', { name: 'Deployment/web' });
    expect(link).toHaveAttribute('href', '/c/secondary+primary/deployments/payments/web');
  });

  it.each([
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'Rollout', name: 'checkout' },
    { apiVersion: 'keda.sh/v1alpha1', kind: 'ScaledObject', name: 'orders-scaler' },
  ])(
    'renders plain-text reference for unregistered target $kind/$name without a link',
    ({ apiVersion, kind, name }) => {
      const customHpa = makeHpa({
        spec: {
          minReplicas: 1,
          maxReplicas: 5,
          scaleTargetRef: { apiVersion, kind, name },
        },
      });

      expect(customHpa.referenceObject).toBeNull();

      renderHpaDetails(customHpa);

      const refCell = screen.getByText('Reference').nextElementSibling;
      expect(refCell).toHaveTextContent(`${kind}/${name}`);
      expect(screen.queryByRole('link')).toBeNull();
    }
  );

  it('keeps valid target visible as plain text when referenceObject is null', () => {
    const hpaWithNullReference = {
      spec: {
        minReplicas: 1,
        maxReplicas: 5,
        scaleTargetRef: { apiVersion: 'apps/v1', kind: 'Deployment', name: 'web' },
      },
      status: { currentReplicas: 2, desiredReplicas: 3 },
      referenceObject: null,
      metrics: () => [],
      jsonData: {},
    } as any;

    renderHpaDetails(hpaWithNullReference);

    const refCell = screen.getByText('Reference').nextElementSibling;
    expect(refCell).toHaveTextContent('Deployment/web');
    expect(screen.queryByRole('link')).toBeNull();
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
  ])('falls back to dash for $label without malformed labels or links', ({ spec }) => {
    const incompleteHpa = new HPA({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: { name: 'incomplete-hpa', namespace: 'default' },
      spec,
    } as any);

    renderHpaDetails(incompleteHpa);

    const refCell = screen.getByText('Reference').nextElementSibling;
    expect(refCell).toHaveTextContent('-');
    expect(refCell?.textContent?.trim()).toBe('-');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
