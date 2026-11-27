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
import Job from '../../lib/k8s/job';
import { JobsListRenderer, makeJobStatusLabel, makeJobStatusValue } from './List';

const { MockJobSuspendButton, mockResourceListView } = vi.hoisted(() => ({
  MockJobSuspendButton: vi.fn(() => null),
  mockResourceListView: vi.fn(),
}));

vi.mock('../../lib/k8s/job', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/k8s/job')>();
  return actual;
});

vi.mock('./JobSuspendButton', () => ({
  default: MockJobSuspendButton,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

const fakeJob: any = {
  kind: 'Job',
  metadata: { name: 'test-job', namespace: 'default', uid: 'job-abc-123' },
  spec: {
    completions: 1,
    parallelism: 1,
    template: {
      spec: {
        containers: [{ name: 'main', image: 'busybox' }],
      },
    },
  },
  status: {},
  getContainers: () => [{ name: 'main', image: 'busybox' }],
  getDuration: () => -1,
};

describe('JobsListRenderer', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('adds a suspend row action to the jobs table', () => {
    render(<JobsListRenderer jobs={[fakeJob]} />);

    const props = mockResourceListView.mock.calls[0][0];
    const suspendAction = props.actions.find((action: any) => action.id === 'suspend');
    const closeMenu = vi.fn();
    const button = suspendAction.action({ item: fakeJob, closeMenu });

    expect(button.type).toBe(MockJobSuspendButton);
    expect(button.props.item).toBe(fakeJob);
    expect(button.props.buttonStyle).toBe('menu');
    expect(button.props.afterConfirm).toBe(closeMenu);
  });

  it('renders live updating duration cell for running Jobs and fixed duration for completed Jobs', () => {
    vi.stubEnv('UNDER_TEST', 'false');
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));

    try {
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

      render(<JobsListRenderer jobs={[runningJob, completedJob]} />);

      const props = mockResourceListView.mock.calls[0][0];
      const durationColumn = props.columns.find((col: any) => col.id === 'duration');
      expect(durationColumn.render).toBeTypeOf('function');

      const { rerender } = render(<>{durationColumn.render(runningJob)}</>);
      expect(screen.getByText('10s')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByText('15s')).toBeInTheDocument();

      rerender(<>{durationColumn.render(completedJob)}</>);
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

describe('makeJobStatusValue and makeJobStatusLabel', () => {
  const makeJob = (overrides: Record<string, any> = {}) =>
    ({
      metadata: { name: 'job-1', namespace: 'default', ...(overrides.metadata ?? {}) },
      status: { ...(overrides.status ?? {}) },
    } as unknown as Job);

  it('returns Running for active/started jobs without terminal conditions', () => {
    const runningJob = makeJob({ status: { active: 1, startTime: '2026-01-01T00:00:00Z' } });
    expect(makeJobStatusValue(runningJob)).toBe('Running');
    expect(makeJobStatusLabel(runningJob)).not.toBeNull();
  });

  it('follows kubectl precedence: Complete > Failed > Terminating > Suspended > FailureTarget > SuccessCriteriaMet', () => {
    expect(
      makeJobStatusValue(
        makeJob({
          metadata: { deletionTimestamp: '2026-01-01T00:05:00Z' },
          status: {
            active: 1,
            conditions: [
              { type: 'Suspended', status: 'True' },
              { type: 'Complete', status: 'True' },
            ],
          },
        })
      )
    ).toBe('Complete');

    expect(
      makeJobStatusValue(
        makeJob({
          metadata: { deletionTimestamp: '2026-01-01T00:05:00Z' },
          status: { conditions: [{ type: 'Suspended', status: 'True' }] },
        })
      )
    ).toBe('Terminating');

    expect(
      makeJobStatusValue(
        makeJob({
          status: {
            conditions: [
              { type: 'SuccessCriteriaMet', status: 'True' },
              { type: 'FailureTarget', status: 'True' },
            ],
          },
        })
      )
    ).toBe('FailureTarget');

    expect(
      makeJobStatusValue(
        makeJob({
          status: { conditions: [{ type: 'SuccessCriteriaMet', status: 'True' }] },
        })
      )
    ).toBe('SuccessCriteriaMet');
  });

  it('returns - / null when job has empty status and no deletionTimestamp', () => {
    const emptyJob = makeJob();
    expect(makeJobStatusValue(emptyJob)).toBe('-');
    expect(makeJobStatusLabel(emptyJob)).toBeNull();
  });
});

describe('Job.getDuration', () => {
  it('returns completionTime - startTime for completed jobs', () => {
    const completed = new Job({
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'done', namespace: 'default' },
      spec: { template: { spec: { containers: [] } } },
      status: {
        startTime: '2026-01-01T00:00:00Z',
        completionTime: '2026-01-01T00:01:30Z',
      },
    } as any);
    expect(completed.getDuration()).toBe(90_000);
  });

  it('returns elapsed duration under UNDER_TEST snapshot override', () => {
    const failedNoCompletion = new Job({
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'failed', namespace: 'default' },
      spec: { template: { spec: { containers: [] } } },
      status: {
        startTime: '2026-01-01T00:00:00Z',
        failed: 1,
        conditions: [{ type: 'Failed', status: 'True' }],
      },
    } as any);
    expect(failedNoCompletion.getDuration()).toBe(90 * 24 * 3600 * 1000);
  });

  describe('with snapshot override disabled and frozen clock', () => {
    beforeEach(() => {
      vi.stubEnv('UNDER_TEST', 'false');
      vi.useFakeTimers({
        toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      });
      vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('returns exact elapsed duration for a running Job without completionTime', () => {
      const running = new Job({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'running', namespace: 'default' },
        spec: { template: { spec: { containers: [] } } },
        status: {
          active: 1,
          startTime: '2026-01-01T00:00:00Z',
        },
      } as any);

      expect(running.getDuration()).toBe(300_000);
      expect(running.getDuration({ useSnapshotOverride: false })).toBe(300_000);
    });

    it('returns exact elapsed duration for a failed Job without completionTime', () => {
      const failedNoCompletion = new Job({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'failed', namespace: 'default' },
        spec: { template: { spec: { containers: [] } } },
        status: {
          startTime: '2026-01-01T00:02:30Z',
          failed: 1,
          conditions: [{ type: 'Failed', status: 'True' }],
        },
      } as any);

      expect(failedNoCompletion.getDuration()).toBe(150_000);
    });

    it('returns zero when startTime is in the future', () => {
      const futureStart = new Job({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'future', namespace: 'default' },
        spec: { template: { spec: { containers: [] } } },
        status: {
          active: 1,
          startTime: '2026-01-01T00:06:00Z',
        },
      } as any);

      expect(futureStart.getDuration()).toBe(0);
    });
  });

  it('returns -1 when startTime is missing', () => {
    const notStarted = new Job({
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: 'pending', namespace: 'default' },
      spec: { template: { spec: { containers: [] } } },
      status: {},
    } as any);
    expect(notStarted.getDuration()).toBe(-1);
  });
});
