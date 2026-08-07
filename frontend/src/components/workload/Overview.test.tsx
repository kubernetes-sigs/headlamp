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

const { namespacesMock, workloadMocks } = vi.hoisted(() => {
  const kinds = [
    'cronJob',
    'daemonSet',
    'deployment',
    'job',
    'jobSet',
    'pod',
    'replicaSet',
    'statefulSet',
  ];

  return {
    namespacesMock: vi.fn((): string[] => []),
    workloadMocks: Object.fromEntries(
      kinds.map(kind => [kind, vi.fn(() => [[]] as any)])
    ) as Record<string, ReturnType<typeof vi.fn>>,
  };
});

vi.mock('react-i18next', async importOriginal => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key.split('|').pop() }),
}));

vi.mock('../../lib/k8s/cronJob', () => ({
  default: { className: 'CronJob', pluralName: 'cronjobs', useList: workloadMocks.cronJob },
}));
vi.mock('../../lib/k8s/daemonSet', () => ({
  default: { className: 'DaemonSet', pluralName: 'daemonsets', useList: workloadMocks.daemonSet },
}));
vi.mock('../../lib/k8s/deployment', () => ({
  default: {
    className: 'Deployment',
    pluralName: 'deployments',
    useList: workloadMocks.deployment,
  },
}));
vi.mock('../../lib/k8s/job', () => ({
  default: { className: 'Job', pluralName: 'jobs', useList: workloadMocks.job },
}));
vi.mock('../../lib/k8s/jobSet', () => ({
  default: { className: 'JobSet', pluralName: 'jobsets', useList: workloadMocks.jobSet },
}));
vi.mock('../../lib/k8s/pod', () => ({
  default: { className: 'Pod', pluralName: 'pods', useList: workloadMocks.pod },
}));
vi.mock('../../lib/k8s/replicaSet', () => ({
  default: {
    className: 'ReplicaSet',
    pluralName: 'replicasets',
    useList: workloadMocks.replicaSet,
  },
}));
vi.mock('../../lib/k8s/statefulSet', () => ({
  default: {
    className: 'StatefulSet',
    pluralName: 'statefulsets',
    useList: workloadMocks.statefulSet,
  },
}));

vi.mock('../../lib/util', () => ({
  getReadyReplicas: () => 0,
  getTotalReplicas: () => 0,
}));

vi.mock('../../redux/filterSlice', async importOriginal => ({
  ...(await importOriginal<typeof import('../../redux/filterSlice')>()),
  useNamespaces: namespacesMock,
}));

vi.mock('../cluster/ClusterGroupErrorMessage', () => ({
  ClusterGroupErrorMessage: ({ errors }: { errors: { status?: number }[] }) => (
    <div>{`errors:${errors.map(error => error.status).join(',')}`}</div>
  ),
}));

vi.mock('../common/Link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('../common/Resource', () => ({
  PageGrid: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock('./Charts', () => ({
  WorkloadCircleChart: () => <div>chart</div>,
}));

vi.mock('../common/TileChart', () => ({
  default: ({ title, legend }: { title: string; legend: string }) => (
    <div>{`${title}:${legend}`}</div>
  ),
}));

const renderOverview = () =>
  render(
    <MemoryRouter>
      <Overview />
    </MemoryRouter>
  );

describe('Workload Overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    namespacesMock.mockReturnValue([]);
    Object.values(workloadMocks).forEach(useList => useList.mockReturnValue([[]]));
  });

  // Without the namespaces a restricted user's charts count nothing, since the cluster-wide
  // list they fall back to is forbidden.
  it('scopes every workload list to the selected namespaces', () => {
    namespacesMock.mockReturnValue(['team-a']);

    renderOverview();

    Object.entries(workloadMocks).forEach(([kind, useList]) => {
      expect(useList, kind).toHaveBeenCalledWith({ namespace: ['team-a'] });
    });
  });

  // Charting a forbidden list as zero is the symptom this page is fixing, so the kinds that
  // could not be listed say so instead.
  it('replaces the chart of a forbidden kind rather than counting it as zero', () => {
    workloadMocks.pod.mockReturnValue([null, { status: 403, message: 'pods is forbidden' }]);

    renderOverview();

    expect(screen.getByText('Pods:Unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('chart')).toHaveLength(7);
  });

  // One namespace being forbidden does not make the others uncountable, so a list that
  // returned something keeps its chart.
  it('keeps the chart of a kind whose list only partly failed', () => {
    workloadMocks.pod.mockReturnValue([[{}], { status: 403, message: 'pods is forbidden' }]);

    renderOverview();

    expect(screen.getAllByText('chart')).toHaveLength(8);
    expect(screen.queryByText('Pods:Unavailable')).not.toBeInTheDocument();
    expect(screen.getByText('errors:403')).toBeInTheDocument();
  });

  it('reports failures once rather than per workload kind', () => {
    workloadMocks.pod.mockReturnValue([null, { status: 403, message: 'pods is forbidden' }]);
    workloadMocks.job.mockReturnValue([null, { status: 403, message: 'jobs is forbidden' }]);
    workloadMocks.deployment.mockReturnValue([null, { status: 500, message: 'boom' }]);

    renderOverview();

    expect(screen.getByText('errors:403,500')).toBeInTheDocument();
  });
});
