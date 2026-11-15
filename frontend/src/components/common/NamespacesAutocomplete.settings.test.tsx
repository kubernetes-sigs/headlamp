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
import { render, waitFor } from '@testing-library/react';
import { clusterFetch } from '../../lib/k8s/api/v2/fetch';
import { TestContext } from '../../test';
import { NamespacesAutocomplete } from './NamespacesAutocomplete';

vi.mock('../../lib/k8s', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s')>()),
  useCluster: () => 'test',
  useClustersConf: () => ({}),
}));
vi.mock('../../lib/k8s/api/v1/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v1/hooks')>()),
  useSelectedClusters: () => ['test'],
  useCluster: () => 'test',
}));
vi.mock('../../lib/k8s/api/v2/fetch', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v2/fetch')>()),
  clusterFetch: vi.fn(async (url: string) => ({
    json: async () => ({ metadata: { name: String(url).split('/').pop() } }),
  })),
}));

// Mirrors e2e-tests/tests/namespaces.spec.ts: with namespaces configured in the
// settings, the filter loads them one by one and never lists all namespaces.
it('loads namespaces configured in the settings individually', async () => {
  localStorage.setItem(
    'cluster_settings.test',
    JSON.stringify({ allowedNamespaces: ['team-a', 'team-b'] })
  );
  render(
    <TestContext>
      <QueryClientProvider client={new QueryClient()}>
        <NamespacesAutocomplete />
      </QueryClientProvider>
    </TestContext>
  );
  await waitFor(() => {
    const urls = vi.mocked(clusterFetch).mock.calls.map(c => String(c[0]));
    expect(urls).toEqual(
      expect.arrayContaining(['api/v1/namespaces/team-a', 'api/v1/namespaces/team-b'])
    );
  });
  const urls = vi.mocked(clusterFetch).mock.calls.map(c => String(c[0]));
  expect(urls).not.toContain('api/v1/namespaces');
});
