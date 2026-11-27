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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Job from '../../lib/k8s/job';
import JobDuration from './JobDuration';

function makeJob(status: Record<string, any> = {}) {
  return new Job({
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: 'test-job', namespace: 'default', uid: 'job-uid' },
    spec: { template: { spec: { containers: [] } } },
    status,
  } as any);
}

describe('JobDuration', () => {
  beforeEach(() => {
    vi.stubEnv('UNDER_TEST', 'false');
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    });
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('advances elapsed duration for a running Job without resource updates', () => {
    const runningJob = makeJob({
      active: 1,
      startTime: '2026-01-01T00:00:00Z',
    });

    render(<JobDuration job={runningJob} />);
    expect(screen.getByText('10s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('keeps completed Job duration fixed without scheduling refresh timers', () => {
    const completedJob = makeJob({
      startTime: '2026-01-01T00:00:00Z',
      completionTime: '2026-01-01T00:01:30Z',
    });

    render(<JobDuration job={completedJob} />);
    expect(screen.getByText('90s')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText('90s')).toBeInTheDocument();
  });

  it('stops refreshing once completionTime is recorded', () => {
    const runningJob = makeJob({
      active: 1,
      startTime: '2026-01-01T00:00:00Z',
    });

    const { rerender } = render(<JobDuration job={runningJob} />);
    expect(screen.getByText('10s')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText('15s')).toBeInTheDocument();

    const completedJob = makeJob({
      succeeded: 1,
      startTime: '2026-01-01T00:00:00Z',
      completionTime: '2026-01-01T00:00:15Z',
    });
    rerender(<JobDuration job={completedJob} />);

    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText('15s')).toBeInTheDocument();
  });

  it('renders "-" when the Job has not started and schedules no timer', () => {
    const pendingJob = makeJob({});

    render(<JobDuration job={pendingJob} />);
    expect(screen.getByText('-')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
