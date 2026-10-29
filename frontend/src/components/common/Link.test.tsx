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
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Pod from '../../lib/k8s/pod';
import defaultStore from '../../redux/stores/store';
import Link from './Link';

vi.mock('../../lib/k8s/api/v2/hooks', () => ({
  useEndpoints: () => ({ endpoint: { endpoint: 'pods' } }),
  kubeObjectQueryKey: () => ['test-key'],
}));

function createMockPod(name = 'my-test-pod', namespace = 'default') {
  return new Pod({
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace,
      uid: '12345',
      creationTimestamp: '2025-01-01T00:00:00Z',
    },
    spec: {
      containers: [{ name: 'nginx', image: 'nginx:latest' }],
    },
    status: {
      phase: 'Running',
    },
  } as any);
}

function renderWithProviders(ui: React.ReactElement, { store = defaultStore } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

describe('Link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
