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

import { render, screen } from '@testing-library/react';
import type React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Overview from './Overview';

const { chartMocks, eventUseList, namespacesMock, nodeUseList, nodeUseMetrics, podUseList } =
  vi.hoisted(() => ({
    chartMocks: {
      CpuCircularChart: () => <div>cpu</div>,
      MemoryCircularChart: () => <div>memory</div>,
      NodesStatusCircleChart: () => <div>nodes</div>,
      PodsStatusCircleChart: () => <div>pods</div>,
    },
    eventUseList: vi.fn(() => ({ items: [], errors: null })),
    namespacesMock: vi.fn((): string[] => []),
    nodeUseList: vi.fn(() => ({ items: [], errors: null, isSuccess: true } as any)),
    nodeUseMetrics: vi.fn(() => [[], null] as any),
    podUseList: vi.fn(() => ({ items: [], errors: null, isSuccess: true } as any)),
  }));

/**
 * A list reports one error per namespace or cluster it asked, so the mocks mirror the
 * `errors` array the real hook returns rather than a single error.
 */
function listResult(items: object[] | null, ...errors: { status?: number }[]) {
  return {
    items,
    errors: errors.length ? errors : null,
    isSuccess: errors.length === 0,
    // One result per cluster that answered, so null items stand for every request failing.
    clusterResults: items === null ? {} : { 'test-cluster': { items } },
  };
}

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({
    t: (key: string) => key.split('|').pop(),
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
  useNamespaces: namespacesMock,
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

vi.mock('./ClusterGroupErrorMessage', () => ({
  ClusterGroupErrorMessage: ({
    errors,
    namespacedResource,
  }: {
    errors: { status?: number }[];
    namespacedResource?: boolean;
  }) => (
    <div>{`error:${errors.map(error => error.status).join(',')}${
      namespacedResource ? ':namespaced' : ''
    }`}</div>
  ),
}));

vi.mock('./Charts', () => chartMocks);
vi.mock('./Charts/index', () => chartMocks);

const renderOverview = () =>
  render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>
  );

describe('Overview', () => {
  const OVERVIEW_REFETCH_INTERVAL_MS = 60_000;

  beforeEach(() => {
    vi.clearAllMocks();
    namespacesMock.mockReturnValue([]);
    podUseList.mockReturnValue(listResult([]));
    nodeUseList.mockReturnValue(listResult([]));
    nodeUseMetrics.mockReturnValue([[], null]);
  });

  it('polls overview resources instead of opening watch streams', () => {
    renderOverview();

    expect(podUseList).toHaveBeenCalledWith({
      namespace: [],
      refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
    });
    expect(nodeUseList).toHaveBeenCalledWith({ refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS });
    expect(eventUseList).toHaveBeenCalledWith({
      limit: 2000,
      namespace: [],
      refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
    });
  });

  // A user without cluster-wide list permissions only gets counts when the request is
  // scoped to the namespaces they can read.
  it('scopes the pod list to the selected namespaces', () => {
    namespacesMock.mockReturnValue(['team-a', 'team-b']);

    renderOverview();

    expect(podUseList).toHaveBeenCalledWith({
      namespace: ['team-a', 'team-b'],
      refetchInterval: OVERVIEW_REFETCH_INTERVAL_MS,
    });
  });

  it('reports a forbidden pod list rather than charting it as empty', () => {
    podUseList.mockReturnValue(listResult(null, { status: 403 }));

    renderOverview();

    expect(screen.queryByText('pods')).not.toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Pods')).toBeInTheDocument();
    expect(screen.getByText('error:403:namespaced')).toBeInTheDocument();
    expect(screen.getByText('nodes')).toBeInTheDocument();
  });

  // One failure affects the cpu, memory and nodes charts alike, and saying so three times
  // buries the section it explains.
  it('reports a failure once for the whole section', () => {
    nodeUseList.mockReturnValue(listResult(null, { status: 403 }));

    renderOverview();

    expect(screen.getByText('error:403')).toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(3);
    ['CPU', 'Memory', 'Nodes'].forEach(title => {
      expect(screen.getByText(title), title).toBeInTheDocument();
    });
  });

  // Nodes are cluster scoped, so narrowing to namespaces would not make them readable.
  it('does not offer namespace scoping for a forbidden node list', () => {
    nodeUseList.mockReturnValue(listResult(null, { status: 403 }));

    renderOverview();

    expect(screen.getByText('error:403')).toBeInTheDocument();
    expect(screen.queryByText('error:403:namespaced')).not.toBeInTheDocument();
  });

  // One namespace answering with nothing is still an answer: the count it contributes is a
  // real zero, so the chart has to keep it rather than claim the pods could not be listed.
  it('keeps the chart when a partly failed pod list answered with no pods', () => {
    podUseList.mockReturnValue(listResult([], { status: 403 }));

    renderOverview();

    expect(screen.getByText('pods')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('error:403:namespaced')).toBeInTheDocument();
  });

  // A list spanning several namespaces reports the one that failed while still returning
  // what the others found, so the counts must survive alongside the message.
  it('keeps the chart when only part of the pod list failed', () => {
    podUseList.mockReturnValue(listResult([{}], { status: 403 }));

    renderOverview();

    expect(screen.getByText('pods')).toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('error:403:namespaced')).toBeInTheDocument();
  });

  // Nodes being readable does not make their usage readable: summing an empty metric set
  // would read as 0 usage rather than as the missing permission it is.
  it('does not chart usage of readable nodes when metrics are forbidden', () => {
    nodeUseList.mockReturnValue(listResult([{}]));
    nodeUseMetrics.mockReturnValue([[], { status: 403 }]);

    renderOverview();

    expect(screen.queryByText('cpu')).not.toBeInTheDocument();
    expect(screen.queryByText('memory')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    ['CPU', 'Memory'].forEach(title => {
      expect(screen.getByText(title), title).toBeInTheDocument();
    });
    expect(screen.getByText('error:403')).toBeInTheDocument();
    expect(screen.getByText('nodes')).toBeInTheDocument();
  });

  // Every namespace of a fanned out list reports its own failure, and reading only the
  // first one drops the rest along with the hint their status would have raised.
  it('reports every error of a partly failed list, not only the first', () => {
    podUseList.mockReturnValue(listResult(null, { status: 500 }, { status: 403 }));

    renderOverview();

    expect(screen.getByText('error:500,403:namespaced')).toBeInTheDocument();
  });

  it('keeps the list charts when only metrics are forbidden', () => {
    nodeUseMetrics.mockReturnValue([[], { status: 403 }]);

    renderOverview();

    expect(screen.getByText('pods')).toBeInTheDocument();
    expect(screen.getByText('nodes')).toBeInTheDocument();

    expect(screen.queryByText('cpu')).not.toBeInTheDocument();
    expect(screen.queryByText('memory')).not.toBeInTheDocument();
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    ['CPU', 'Memory'].forEach(title => {
      expect(screen.getByText(title), title).toBeInTheDocument();
    });
    expect(screen.getByText('error:403')).toBeInTheDocument();
  });
});
