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
import React from 'react';
import { TestContext } from '../../test';
import JobDetails from './Details';

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

vi.mock('../../lib/k8s/job', () => ({
  default: { kind: 'Job' },
}));

vi.mock('./List', () => ({
  makeJobStatusLabel: (job: any) => {
    if (!job?.status?.conditions) return null;
    const condition = job.status.conditions.find(
      (c: any) => ['Complete', 'Failed', 'Suspended'].includes(c.type) && c.status === 'True'
    );
    return condition ? condition.type : null;
  },
}));

vi.mock('../../lib/util', () => ({
  formatDuration: () => '5s',
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

  it('provides onResourceUpdate to DetailsGrid for tracking workload changes', () => {
    render(
      <TestContext routerMap={{ namespace: 'default', name: 'test-job' }}>
        <JobDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.onResourceUpdate).toBeDefined();

    // Should not throw when called with a resource
    expect(() => props.onResourceUpdate(fakeJob)).not.toThrow();
    // Should not throw when called with a different UID (triggers state reset)
    expect(() =>
      props.onResourceUpdate({ ...fakeJob, metadata: { ...fakeJob.metadata, uid: 'new-uid' } })
    ).not.toThrow();
  });
});
