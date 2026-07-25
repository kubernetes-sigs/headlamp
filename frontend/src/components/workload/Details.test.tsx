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
import WorkloadDetails from './Details';

const { mockLaunchWorkloadLogs, mockDetailsGrid } = vi.hoisted(() => ({
  mockLaunchWorkloadLogs: vi.fn(),
  mockDetailsGrid: vi.fn(),
}));

// The test passes a fake workload through the mocked DetailsGrid's onResourceUpdate.
// All other DetailsGrid concerns (data fetching, rendering) are out of scope here.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    const { onResourceUpdate } = props;
    React.useEffect(() => {
      onResourceUpdate?.(fakeDeployment, null);
    }, [onResourceUpdate]);
    return null;
  },
  LogsButton: () => null,
  RollbackButton: () => null,
  ConditionsSection: () => null,
  ContainersSection: () => null,
  MetadataDictGrid: () => null,
  OwnedPodsSection: () => null,
  RevisionHistorySection: () => null,
  launchWorkloadLogs: (...args: any[]) => mockLaunchWorkloadLogs(...args),
  LOGGABLE_WORKLOAD_KINDS: new Set(['Deployment', 'ReplicaSet', 'DaemonSet', 'StatefulSet']),
}));

const fakeDeployment: any = {
  kind: 'Deployment',
  metadata: { name: 'nginx', namespace: 'default', uid: 'dep-abc-123' },
  spec: {},
  status: {},
};

const fakeWorkloadKind: any = { kind: 'Deployment' };

describe('WorkloadDetails ?view=logs deep-link', () => {
  beforeEach(() => {
    mockLaunchWorkloadLogs.mockReset();
    mockDetailsGrid.mockReset();
  });

  it('auto-launches logs when URL has ?view=logs', () => {
    render(
      <TestContext urlSearchParams={{ view: 'logs' }}>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    expect(mockLaunchWorkloadLogs).toHaveBeenCalledTimes(1);
    expect(mockLaunchWorkloadLogs).toHaveBeenCalledWith(fakeDeployment, expect.any(Function));
  });

  it('does not launch logs when URL has no view param', () => {
    render(
      <TestContext>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    expect(mockLaunchWorkloadLogs).not.toHaveBeenCalled();
  });

  it('does not launch logs when view is not logs', () => {
    render(
      <TestContext urlSearchParams={{ view: 'something-else' }}>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    expect(mockLaunchWorkloadLogs).not.toHaveBeenCalled();
  });

  it('does not re-launch on rerender for the same workload', () => {
    const { rerender } = render(
      <TestContext urlSearchParams={{ view: 'logs' }}>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    rerender(
      <TestContext urlSearchParams={{ view: 'logs' }}>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    expect(mockLaunchWorkloadLogs).toHaveBeenCalledTimes(1);
  });

  it('does not launch logs for non-loggable workload kinds (e.g. Job)', () => {
    const jobWorkloadKind: any = { kind: 'Job' };

    render(
      <TestContext urlSearchParams={{ view: 'logs' }}>
        <WorkloadDetails workloadKind={jobWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    expect(mockLaunchWorkloadLogs).not.toHaveBeenCalled();
  });
});
