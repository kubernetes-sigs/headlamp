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

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import Job from '../../lib/k8s/job';
import { TestContext } from '../../test';
import JobDetails from './Details';
import JobSuspendButton from './JobSuspendButton';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    const { onResourceUpdate } = props;
    React.useEffect(() => {
      onResourceUpdate?.(fakeJob, null);
    }, [onResourceUpdate]);
    return null;
  },
  LogsButton: () => null,
  ConditionsSection: () => null,
  ContainersSection: () => null,
  MetadataDictGrid: () => null,
  OwnedPodsSection: () => null,
}));

vi.mock('../diagnostics/Diagnostics', () => ({
  WorkloadDiagnosticsSection: () => null,
}));

vi.mock('../../lib/k8s/job', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/k8s/job')>();
  return actual;
});

vi.mock('./List', () => ({
  makeJobStatusLabel: (job: any) => {
    if (!job?.status?.conditions) return null;
    const condition = job.status.conditions.find(
      (c: any) => ['Complete', 'Failed', 'Suspended'].includes(c.type) && c.status === 'True'
    );
    return condition ? condition.type : null;
  },
}));

const fakeJob: any = {
  kind: 'Job',
  metadata: { name: 'test-job', namespace: 'default', uid: 'job-abc-123' },
  spec: {
    completions: 3,
    parallelism: 2,
    backoffLimit: 6,
    completionMode: 'NonIndexed',
    selector: { matchLabels: { app: 'test' } },
  },
  status: {
    active: 1,
    succeeded: 1,
    failed: 0,
    conditions: [{ type: 'Complete', status: 'False' }],
  },
  getDuration: () => 5000,
};

describe('JobDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes Job-specific extraInfo fields to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(fakeJob);

    const fieldNames = extraInfo.map((f: any) => f.name);
    expect(fieldNames.some((n: string) => n.includes('Completions'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Parallelism'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Backoff Limit'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Completion Mode'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Active'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Succeeded'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Failed'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Duration'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Suspend'))).toBe(true);
    expect(fieldNames.some((n: string) => n.includes('Selector'))).toBe(true);
  });

  it('hides Status row when no conditions exist', () => {
    const jobWithoutConditions: any = {
      ...fakeJob,
      status: { ...fakeJob.status, conditions: undefined },
    };

    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraInfo = props.extraInfo(jobWithoutConditions);
    const statusField = extraInfo.find((f: any) => f.name.includes('Status'));

    expect(statusField.hide).toBe(true);
  });

  it('hides the index rows for a Job that does not set them', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const extraInfo = mockDetailsGrid.mock.calls[0][0].extraInfo(fakeJob);
    const row = (name: string) => extraInfo.find((f: any) => f.name === name);

    for (const name of [
      'Completed Indexes',
      'Failed Indexes',
      'Backoff Limit Per Index',
      'Max Failed Indexes',
    ]) {
      expect(row(name).hide).toBe(true);
    }
  });

  it('shows the completed and failed indexes and the per-index limits of an Indexed Job', () => {
    const indexedJob: any = {
      ...fakeJob,
      spec: {
        ...fakeJob.spec,
        completionMode: 'Indexed',
        backoffLimitPerIndex: 0,
        maxFailedIndexes: 2,
      },
      status: { ...fakeJob.status, completedIndexes: '0,2', failedIndexes: '1,3-4' },
    };

    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const extraInfo = mockDetailsGrid.mock.calls[0][0].extraInfo(indexedJob);
    const row = (name: string) => extraInfo.find((f: any) => f.name === name);

    expect(row('Completed Indexes')).toMatchObject({ value: '0,2', hide: false });
    expect(row('Failed Indexes')).toMatchObject({ value: '1,3-4', hide: false });
    // A limit of 0 means an index is not retried, and it is still shown.
    expect(row('Backoff Limit Per Index')).toMatchObject({ value: 0, hide: false });
    expect(row('Max Failed Indexes')).toMatchObject({ value: 2, hide: false });
  });

  it('provides onResourceUpdate to DetailsGrid for tracking workload changes', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.onResourceUpdate).toBeDefined();

    // Should not throw when called with a resource
    expect(() => act(() => props.onResourceUpdate(fakeJob))).not.toThrow();
    // Should not throw when called with a different UID (triggers state reset)
    expect(() =>
      act(() =>
        props.onResourceUpdate({ ...fakeJob, metadata: { ...fakeJob.metadata, uid: 'new-uid' } })
      )
    ).not.toThrow();
  });

  it('adds a suspend action for running jobs', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const actions = props.actions(fakeJob);
    const suspendAction = actions.find((action: any) => action.id === 'suspend');

    expect(suspendAction.action.type).toBe(JobSuspendButton);
    expect(suspendAction.action.props.item).toBe(fakeJob);
  });

  it('adds a resume action for suspended jobs', () => {
    const suspendedJob = {
      ...fakeJob,
      spec: {
        ...fakeJob.spec,
        suspend: true,
      },
    };

    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const actions = props.actions(suspendedJob);
    const suspendAction = actions.find((action: any) => action.id === 'suspend');

    expect(suspendAction.action.type).toBe(JobSuspendButton);
    expect(suspendAction.action.props.item).toBe(suspendedJob);
  });

  it('refreshes Duration without resource updates for running Jobs and keeps completed Jobs fixed', () => {
    vi.stubEnv('UNDER_TEST', 'false');
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));

    try {
      render(
        <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
          <JobDetails />
        </TestContext>
      );

      const props = mockDetailsGrid.mock.calls[0][0];

      const runningJob = new Job({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'running-job', namespace: 'default' },
        spec: { template: { spec: { containers: [] } } },
        status: {
          active: 1,
          startTime: '2026-01-01T00:00:00Z',
        },
      } as any);
      const runningDurationField = props
        .extraInfo(runningJob)
        .find((f: any) => f.name.includes('Duration'));

      const { rerender } = render(<TestContext>{runningDurationField.value}</TestContext>);
      expect(screen.getByText('10s')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByText('15s')).toBeInTheDocument();

      const completedJob = new Job({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'completed-job', namespace: 'default' },
        spec: { template: { spec: { containers: [] } } },
        status: {
          startTime: '2026-01-01T00:00:00Z',
          completionTime: '2026-01-01T00:01:30Z',
        },
      } as any);
      const completedDurationField = props
        .extraInfo(completedJob)
        .find((f: any) => f.name.includes('Duration'));

      rerender(<TestContext>{completedDurationField.value}</TestContext>);
      expect(screen.getByText('90s')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });
      expect(screen.getByText('90s')).toBeInTheDocument();
    } finally {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
  });
});
