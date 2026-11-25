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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { kubeObjectQueryKey } from '../../lib/k8s/api/v2/hooks';
import Pod from '../../lib/k8s/pod';
import Secret from '../../lib/k8s/secret';
import Link from './Link';

// drawerMode disabled: keeps KubeObjectLink's onClick as plain navigation
// (no Activity-panel launch) so we can assert on it directly.
vi.mock('../../redux/hooks', () => ({ useTypedSelector: vi.fn(() => undefined) }));
// These pull in the full resource-class barrel (lib/k8s/index), which isn't
// needed for this test and errors when imported outside the app's normal
// module load order.
vi.mock('../resourceMap/details/KubeNodeDetails', () => ({
  canRenderDetails: () => false,
  KubeObjectDetails: () => null,
}));
vi.mock('../resourceMap/kubeIcon/KubeIcon', () => ({ KubeIcon: () => null }));
vi.mock('../activity/Activity', () => ({ Activity: { launch: vi.fn() } }));
// The real route registry pulls in every resource class (including ones with
// circular-import issues when loaded outside the app's normal entry point).
vi.mock('../../lib/router/createRouteURL', () => ({
  createRouteURL: (routeName: string, params?: Record<string, string>) =>
    `/${routeName}/${params?.namespace ?? ''}/${params?.name ?? ''}`,
}));

function renderLink(kubeObject: Secret | Pod, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Link kubeObject={kubeObject} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('KubeObjectLink', () => {
  it('does not seed the query cache with list-derived data for Secrets', async () => {
    const secret = new Secret(
      {
        kind: 'Secret',
        apiVersion: 'v1',
        metadata: { name: 'demo-secret', namespace: 'headlamp', uid: '1' },
        data: { password: 'UzNjcjN0UEBzc3cwcmQh' },
        type: 'Opaque',
      } as any,
      'test-cluster'
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderLink(secret, queryClient);

    await userEvent.click(screen.getByText('demo-secret'));

    const key = kubeObjectQueryKey({
      cluster: 'test-cluster',
      endpoint: (Secret.apiEndpoint as any).apiInfo[0],
      namespace: 'headlamp',
      name: 'demo-secret',
    });

    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('clears a pre-existing cache entry for a Secret before navigation', async () => {
    const secret = new Secret(
      {
        kind: 'Secret',
        apiVersion: 'v1',
        metadata: { name: 'demo-secret', namespace: 'headlamp', uid: '1' },
        data: { password: 'UzNjcjN0UEBzc3cwcmQh' },
        type: 'Opaque',
      } as any,
      'test-cluster'
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const key = kubeObjectQueryKey({
      cluster: 'test-cluster',
      endpoint: (Secret.apiEndpoint as any).apiInfo[0],
      namespace: 'headlamp',
      name: 'demo-secret',
    });

    // Simulate a value cached from an earlier authorized view.
    queryClient.setQueryData(key, secret);

    renderLink(secret, queryClient);

    await userEvent.click(screen.getByText('demo-secret'));

    expect(queryClient.getQueryData(key)).toBeUndefined();
  });

  it('still seeds the query cache with list-derived data for other resource kinds', async () => {
    const pod = new Pod(
      {
        kind: 'Pod',
        apiVersion: 'v1',
        metadata: { name: 'demo-pod', namespace: 'headlamp', uid: '2' },
        spec: { containers: [] },
        status: {},
      } as any,
      'test-cluster'
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderLink(pod, queryClient);

    await userEvent.click(screen.getByText('demo-pod'));

    const key = kubeObjectQueryKey({
      cluster: 'test-cluster',
      endpoint: (Pod.apiEndpoint as any).apiInfo[0],
      namespace: 'headlamp',
      name: 'demo-pod',
    });

    expect(queryClient.getQueryData(key)).toBe(pod);
  });
});
