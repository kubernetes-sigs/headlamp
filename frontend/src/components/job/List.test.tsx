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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import { JobsListRenderer } from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/job', () => ({
  default: {
    kind: 'Job',
    useList: () => ({ items: [], errors: null }),
  },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('JobsListRenderer', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns including completions', () => {
    render(
      <TestContext>
        <JobsListRenderer jobs={[]} />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toContain('completions');
  });

  it('computes completions column value as status.succeeded / spec.completions', () => {
    render(
      <TestContext>
        <JobsListRenderer jobs={[]} />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const completionsCol = props.columns.find((c: any) => c?.id === 'completions');
    expect(completionsCol).toBeDefined();

    // Divergent values: succeeded=2, completions=5, parallelism=3 -> should be 2/5 (not 5/3)
    const divergentJob: any = {
      spec: { completions: 5, parallelism: 3 },
      status: { succeeded: 2 },
    };
    expect(completionsCol.getValue(divergentJob)).toBe('2/5');

    // Omitted spec.completions defaults to 1
    const omittedCompletionsJob: any = {
      spec: { parallelism: 2 },
      status: { succeeded: 1 },
    };
    expect(completionsCol.getValue(omittedCompletionsJob)).toBe('1/1');

    // Omitted status.succeeded defaults to 0
    const runningJob: any = {
      spec: { completions: 4 },
      status: { active: 1 },
    };
    expect(completionsCol.getValue(runningJob)).toBe('0/4');

    // Completely empty status and spec fallback safely
    const emptyJob: any = {};
    expect(completionsCol.getValue(emptyJob)).toBe('0/1');
  });

  it('sorts completions by succeeded count then by desired completions', () => {
    render(
      <TestContext>
        <JobsListRenderer jobs={[]} />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const completionsCol = props.columns.find((c: any) => c?.id === 'completions');
    expect(completionsCol).toBeDefined();

    const jobA: any = {
      status: { succeeded: 0 },
      spec: { completions: 1, parallelism: 4 },
    };
    const jobB: any = {
      status: { succeeded: 1 },
      spec: { completions: 3, parallelism: 1 },
    };
    const jobC: any = {
      status: { succeeded: 1 },
      spec: { completions: 5, parallelism: 2 },
    };
    const jobD: any = {
      status: { succeeded: 2 },
      spec: { completions: 2, parallelism: 1 },
    };

    // jobA (0/1) should come before jobB (1/3)
    expect(completionsCol.sort(jobA, jobB)).toBeLessThan(0);
    expect(completionsCol.sort(jobB, jobA)).toBeGreaterThan(0);

    // jobB (1/3) and jobC (1/5) have equal succeeded (1), so jobB with fewer desired completions comes first
    expect(completionsCol.sort(jobB, jobC)).toBeLessThan(0);
    expect(completionsCol.sort(jobC, jobB)).toBeGreaterThan(0);

    // Equal jobs return 0
    expect(completionsCol.sort(jobB, jobB)).toBe(0);

    // Array sort should produce [jobA, jobB, jobC, jobD]
    const sorted = [jobD, jobA, jobC, jobB].sort(completionsCol.sort);
    expect(sorted).toEqual([jobA, jobB, jobC, jobD]);

    // Omitted spec.completions defaults to 1 during sort
    const jobOmittedSpec: any = {
      status: { succeeded: 1 },
      spec: {},
    };
    // jobOmittedSpec (1/1) vs jobB (1/3) -> jobOmittedSpec comes first
    expect(completionsCol.sort(jobOmittedSpec, jobB)).toBeLessThan(0);

    // Omitted status.succeeded defaults to 0 during sort
    const jobOmittedStatus: any = {
      status: {},
      spec: { completions: 2 },
    };
    // jobOmittedStatus (0/2) vs jobA (0/1) -> jobA comes first
    expect(completionsCol.sort(jobOmittedStatus, jobA)).toBeGreaterThan(0);

    // Parallelism differences do not affect sort order
    // jobA has parallelism 4, jobB has parallelism 1, but jobA has fewer succeeded
    expect(completionsCol.sort(jobA, jobB)).toBeLessThan(0);
  });
});
