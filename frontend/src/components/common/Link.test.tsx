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

import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { kubeObjectQueryKey } from '../../lib/k8s/api/v2/hooks';
import ConfigMap from '../../lib/k8s/configMap';
import Secret from '../../lib/k8s/secret';
import Link from './Link';

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: () => false,
}));
vi.mock('../../lib/k8s/api/v2/hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/k8s/api/v2/hooks')>()),
  useEndpoints: () => ({ endpoint: { version: 'v1', resource: 'secrets' } }),
}));

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach(client => client.clear()));

function renderSecretLink(dataCount?: number, cached = false, missingKind = false, active = false) {
  const client = new QueryClient();
  clients.push(client);
  const full = new Secret(
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'example',
        namespace: 'default',
        uid: 'example',
        creationTimestamp: '2026-01-01T00:00:00Z',
      },
      type: 'Opaque',
      data: { token: 'dmFsdWU=' },
    },
    'test'
  );
  const row =
    dataCount === undefined
      ? full
      : new Secret(
          {
            ...full.jsonData,
            data: {},
            dataCount,
          },
          'test'
        );
  if (missingKind) Reflect.deleteProperty(row.jsonData, 'kind');
  vi.spyOn(row, 'getDetailsLink').mockReturnValue('/secret/example');
  const key = kubeObjectQueryKey({
    cluster: 'test',
    endpoint: { version: 'v1', resource: 'secrets' },
    namespace: 'default',
    name: 'example',
  });
  if (cached) client.setQueryData(key, full);
  const fetch = vi.fn().mockResolvedValue(full);
  const observer = active
    ? new QueryObserver(client, {
        queryKey: key,
        queryFn: fetch,
        staleTime: Infinity,
      })
    : undefined;
  const unsubscribe = observer ? observer.subscribe(() => {}) : () => {};
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Link kubeObject={row}>example</Link>
      </MemoryRouter>
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('link', { name: 'example' }));
  return { client, key, full, fetch, unsubscribe };
}

describe('Secret detail cache when following a resource link', () => {
  it('uses the Secret class when compact row kind is absent', () => {
    const { client, key, full } = renderSecretLink(1, true, true);
    expect(client.getQueryData(key)).toBe(full);
  });

  it('refetches an active full Secret query after following a compact row', async () => {
    const { fetch, unsubscribe } = renderSecretLink(1, true, false, true);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    unsubscribe();
  });

  it('still seeds non-Secret objects', () => {
    const client = new QueryClient();
    clients.push(client);
    const object = new ConfigMap(
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'example',
          namespace: 'default',
          uid: 'example',
          creationTimestamp: '2026-01-01T00:00:00Z',
        },
        data: {},
      },
      'test'
    );
    vi.spyOn(object, 'getDetailsLink').mockReturnValue('/configmap/example');
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Link kubeObject={object}>configmap</Link>
        </MemoryRouter>
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole('link', { name: 'configmap' }));
    const key = kubeObjectQueryKey({
      cluster: 'test',
      endpoint: { version: 'v1', resource: 'secrets' },
      namespace: 'default',
      name: 'example',
    });
    expect(client.getQueryData(key)).toBe(object);
  });

  it.each([0, 1])(
    'does not replace a full cached Secret with a compact row showing %i keys',
    dataCount => {
      const { client, key, full } = renderSecretLink(dataCount, true);
      expect(client.getQueryData(key)).toBe(full);
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  );

  it.each([0, 1])(
    'does not seed an empty detail cache with a compact row showing %i keys',
    dataCount => {
      const { client, key } = renderSecretLink(dataCount);
      expect(client.getQueryData(key)).toBeUndefined();
      expect(client.getQueryState(key)).toBeUndefined();
    }
  );

  it('still seeds and invalidates the detail cache for a full Secret', () => {
    const { client, key, full } = renderSecretLink();
    expect(client.getQueryData(key)).toBe(full);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
