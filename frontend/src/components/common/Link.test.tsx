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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kubeObjectQueryKey } from '../../lib/k8s/api/v2/hooks';
import ConfigMap from '../../lib/k8s/configMap';
import Secret from '../../lib/k8s/secret';
import { getDefaultRoutes, setDefaultRoutes } from '../../lib/router/getDefaultRoutes';
import Link from './Link';

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: () => false,
}));

vi.mock('../../lib/k8s/api/v2/hooks', async importOriginal => {
  const actual = (await importOriginal()) as typeof import('../../lib/k8s/api/v2/hooks');
  return {
    ...actual,
    useEndpoints: () => ({ endpoint: { version: 'v1', resource: 'secrets' } }),
  };
});

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

function createMockPod(name = 'my-test-pod', namespace = 'default') {
  const cm = new ConfigMap(
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name,
        namespace,
        uid: '12345',
        creationTimestamp: '2025-01-01T00:00:00Z',
      },
      data: {},
    },
    'test'
  );
  vi.spyOn(cm, 'getDetailsLink').mockReturnValue(`/pod/${name}`);
  return cm;
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  clients.push(queryClient);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
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

describe('Link', () => {
  let originalRoutes: ReturnType<typeof getDefaultRoutes>;

  beforeEach(() => {
    vi.clearAllMocks();
    originalRoutes = { ...getDefaultRoutes() };
    setDefaultRoutes({
      ...originalRoutes,
      pods: {
        path: '/pods',
        name: 'pods',
        sidebar: 'pods',
        component: () => null,
        useClusterURL: true,
      },
    });
  });

  afterEach(() => {
    setDefaultRoutes(originalRoutes);
  });

  it('renders a route-based link with text children', () => {
    renderWithProviders(
      <Link routeName="pods" params={{ cluster: 'minikube' }}>
        View Pods
      </Link>
    );

    const linkElement = screen.getByRole('link', { name: 'View Pods' });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', '/c/minikube/pods');
  });

  it('renders a kubeObject-based link with the kubeObject name by default', () => {
    const pod = createMockPod('nginx-pod');
    renderWithProviders(<Link kubeObject={pod} />);

    const linkElement = screen.getByRole('link', { name: 'nginx-pod' });
    expect(linkElement).toBeInTheDocument();
  });

  it('renders a kubeObject-based link with custom children when provided', () => {
    const pod = createMockPod('nginx-pod');
    renderWithProviders(<Link kubeObject={pod}>Custom Pod Label</Link>);

    const linkElement = screen.getByRole('link', { name: 'Custom Pod Label' });
    expect(linkElement).toBeInTheDocument();
  });

  it('renders tooltip when tooltip is provided as a string', () => {
    renderWithProviders(
      <Link routeName="pods" tooltip="Custom Pods Tooltip">
        Pods
      </Link>
    );

    const linkElement = screen.getByRole('link');
    expect(linkElement).toHaveTextContent('Pods');
    expect(linkElement).toHaveAttribute('aria-label', 'Custom Pods Tooltip');
  });

  it('renders tooltip with string children when tooltip is boolean true', () => {
    renderWithProviders(
      <Link routeName="pods" tooltip>
        My Pods Header
      </Link>
    );

    const linkElement = screen.getByRole('link');
    expect(linkElement).toHaveTextContent('My Pods Header');
    expect(linkElement).toHaveAttribute('aria-label', 'My Pods Header');
  });

  it('renders tooltip with kubeObject name when tooltip is boolean true without throwing TypeError', () => {
    const pod = createMockPod('special-worker-pod');

    // This specifically tests the fix for the bug where (props as LinkObjectProps).getName()
    // was mistakenly called instead of props.kubeObject.getName()
    expect(() => {
      renderWithProviders(<Link kubeObject={pod} tooltip />);
    }).not.toThrow();

    const linkElement = screen.getByRole('link');
    expect(linkElement).toHaveTextContent('special-worker-pod');
    expect(linkElement).toHaveAttribute('aria-label', 'special-worker-pod');
  });

  it('opens tooltip when hovered on route-based link', async () => {
    renderWithProviders(
      <Link routeName="pods" tooltip="Custom Pods Tooltip">
        Pods
      </Link>
    );

    const linkElement = screen.getByRole('link');
    fireEvent.mouseOver(linkElement);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('Custom Pods Tooltip');
  });

  it('opens tooltip when hovered on kubeObject-based link', async () => {
    const pod = createMockPod('special-worker-pod');
    renderWithProviders(<Link kubeObject={pod} tooltip />);

    const linkElement = screen.getByRole('link', { name: 'special-worker-pod' });
    fireEvent.mouseOver(linkElement);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    expect(tooltip).toHaveTextContent('special-worker-pod');
  });

  it('invokes custom onClick handler when clicked', () => {
    const handleClick = vi.fn();
    renderWithProviders(
      <Link routeName="pods" onClick={handleClick}>
        Clickable Pods
      </Link>
    );

    const linkElement = screen.getByRole('link', { name: 'Clickable Pods' });
    fireEvent.click(linkElement);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
