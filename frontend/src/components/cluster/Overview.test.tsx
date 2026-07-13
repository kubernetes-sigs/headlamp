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
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Overview from './Overview';

const { chartMocks, eventUseList, nodeUseList, nodeUseMetrics, podUseList } = vi.hoisted(() => ({
  chartMocks: {
    CpuCircularChart: () => <div>cpu</div>,
    MemoryCircularChart: () => <div>memory</div>,
    NodesStatusCircleChart: () => <div>nodes</div>,
    PodsStatusCircleChart: () => <div>pods</div>,
  },
  eventUseList: vi.fn(() => ({ items: [], errors: null })),
  nodeUseList: vi.fn(() => [[]]),
  nodeUseMetrics: vi.fn(() => [[], null]),
  podUseList: vi.fn(() => [[]]),
}));

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../lib/k8s/event', () => ({
  default: {
    maxLimit: 2000,
    useList: eventUseList,
  },
}));

vi.mock('../../lib/k8s/node', () => ({
  default: {
    useList: nodeUseList,
    useMetrics: nodeUseMetrics,
  },
}));

vi.mock('../../lib/k8s/pod', () => ({
  default: {
    useList: podUseList,
  },
}));

vi.mock('../../lib/util', () => ({
  useFilterFunc: () => () => true,
}));

vi.mock('../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/filterSlice')>()),
  useNamespaces: () => [],
}));

vi.mock('../../redux/hooks', () => ({
  useTypedSelector: (selector: any) => selector({ overviewCharts: { processors: [] } }),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../common/Resource', () => ({
  PageGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../common/SectionBox', () => ({
  default: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SectionBox: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

vi.mock('./Charts', () => chartMocks);
vi.mock('./Charts/index', () => chartMocks);

describe('Overview', () => {
  it('polls overview resources instead of opening watch streams', () => {
    const OVERVIEW_REFETCH_INTERVAL_MS = 60_000;

    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>
    );

    expect(podUseList).toHaveBeenCalledWith({ refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS });
    expect(nodeUseList).toHaveBeenCalledWith({ refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS });
    expect(eventUseList).toHaveBeenCalledWith({
      limit: 2000,
      namespace: [],
      refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
    });
  });
});
