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
import { render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, Mock, vi } from 'vitest';
import { TestContext } from '../../../test';

// Mock the data-fetching hooks so we can assert exactly which clusters Home
// auto-connects to. Home must only poll recently-used clusters, not all.
vi.mock('../../../lib/k8s', () => ({
  useClustersConf: vi.fn(() => ({})),
  useClustersVersion: vi.fn(() => [{}, {}]),
}));

vi.mock('../../../lib/k8s/event', () => ({
  default: class Event {},
  useEventWarningList: vi.fn(() => ({})),
}));

// Keep the test focused on the auto-connect wiring by stubbing the heavy children.
vi.mock('./ClusterTable', () => ({ default: () => null }));
vi.mock('./RecentClusters', () => ({ default: () => null }));
vi.mock('../../project/ProjectList', () => ({ default: () => null }));
vi.mock('../../common/SectionBox', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { useClustersConf, useClustersVersion } from '../../../lib/k8s';
import { useEventWarningList } from '../../../lib/k8s/event';
import Home from './index';

function renderHome() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TestContext>
        <Home />
      </TestContext>
    </QueryClientProvider>
  );
}

describe('Home auto-connect gating', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    (useClustersConf as Mock).mockReturnValue({
      c1: { name: 'c1' },
      c2: { name: 'c2' },
      c3: { name: 'c3' },
    });
  });

  it('does not poll any cluster when there are no recently-used clusters', () => {
    renderHome();

    const polledVersions = (useClustersVersion as Mock).mock.calls[0][0] as Array<{ name: string }>;
    expect(polledVersions.map(c => c.name)).toEqual([]);

    const polledWarnings = (useEventWarningList as Mock).mock.calls[0][0] as string[];
    expect(polledWarnings).toEqual([]);
  });

  it('only polls versions and warnings for recently-used clusters', () => {
    localStorage.setItem('recent_clusters', JSON.stringify(['c2']));

    renderHome();

    const polledVersions = (useClustersVersion as Mock).mock.calls[0][0] as Array<{ name: string }>;
    expect(polledVersions.map(c => c.name)).toEqual(['c2']);

    const polledWarnings = (useEventWarningList as Mock).mock.calls[0][0] as string[];
    expect(polledWarnings).toEqual(['c2']);
  });
});
