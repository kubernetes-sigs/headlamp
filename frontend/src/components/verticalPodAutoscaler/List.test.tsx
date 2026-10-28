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
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import VPA from '../../lib/k8s/vpa';
import { TestContext } from '../../test';
import VpaList from './List';

const { mockListView } = vi.hoisted(() => ({ mockListView: vi.fn() }));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return <div data-testid="vpa-list" />;
  },
}));

// SectionBox needs the app theme, which is not relevant here.
vi.mock('../common/SectionBox', () => ({
  default: ({ children }: any) => <div>{children}</div>,
}));

function renderList(clusterParam: string) {
  // getCluster() reads window.location rather than the router, so keep them in sync.
  window.history.pushState({}, '', `/c/${clusterParam}`);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TestContext urlPrefix="/c" routerMap={{ cluster: clusterParam }}>
        <VpaList />
      </TestContext>
    </QueryClientProvider>
  );
}

describe('VpaList', () => {
  let clustersWithVpa: string[];

  beforeEach(() => {
    mockListView.mockReset();
    clustersWithVpa = ['cluster-b'];
    vi.spyOn(VPA, 'isEnabled').mockImplementation(async cluster =>
      clustersWithVpa.includes(cluster ?? '')
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('lists VPAs when only a later selected cluster has VPA installed', async () => {
    renderList('cluster-a+cluster-b');

    expect(await screen.findByTestId('vpa-list')).toBeInTheDocument();
    expect(screen.queryByText(/not enabled/)).not.toBeInTheDocument();
  });

  it('lists only from the clusters that have VPA installed', async () => {
    renderList('cluster-a+cluster-b');

    await screen.findByTestId('vpa-list');
    expect(mockListView.mock.calls.at(-1)![0].clusters).toEqual(['cluster-b']);
  });

  it('lists VPAs for a single cluster that has VPA installed', async () => {
    renderList('cluster-b');

    expect(await screen.findByTestId('vpa-list')).toBeInTheDocument();
  });

  it('shows the not enabled message when no selected cluster has VPA installed', async () => {
    clustersWithVpa = [];
    renderList('cluster-a+cluster-b');

    await waitFor(() => expect(screen.getByText(/not enabled/)).toBeInTheDocument());
    expect(screen.queryByTestId('vpa-list')).not.toBeInTheDocument();
  });
});
