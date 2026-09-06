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

import { act, render } from '@testing-library/react';
import React from 'react';
import { TestContext } from '../../test';
import WorkloadDetails from './Details';

const { mockLaunchWorkloadLogs, mockDetailsGrid, mockOwnedPodsSection, mockDiagnosticsSection } =
  vi.hoisted(() => ({
    mockLaunchWorkloadLogs: vi.fn(),
    mockDetailsGrid: vi.fn(),
    mockOwnedPodsSection: vi.fn(),
    mockDiagnosticsSection: vi.fn(),
  }));

// The test passes a fake workload through the mocked DetailsGrid's onResourceUpdate.
// All other DetailsGrid concerns (data fetching, rendering) are out of scope here.
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    const { onResourceUpdate, extraSections } = props;
    const [item, setItem] = React.useState<any>(null);
    React.useEffect(() => {
      onResourceUpdate?.(fakeDeployment, null);
      setItem(fakeDeployment);
    }, [onResourceUpdate]);
    if (!item) return null;
    const sections = typeof extraSections === 'function' ? extraSections(item, { events: [] }) : [];
    return (
      <>
        {sections.map((s: any) => (
          <React.Fragment key={s.id}>{s.section}</React.Fragment>
        ))}
      </>
    );
  },
  LogsButton: () => null,
  RollbackButton: () => null,
  ConditionsSection: () => null,
  ContainersSection: () => null,
  MetadataDictGrid: () => null,
  OwnedPodsSection: (props: any) => {
    mockOwnedPodsSection(props);
    return null;
  },
  RevisionHistorySection: () => null,
  launchWorkloadLogs: (...args: any[]) => mockLaunchWorkloadLogs(...args),
  LOGGABLE_WORKLOAD_KINDS: new Set(['Deployment', 'ReplicaSet', 'DaemonSet', 'StatefulSet']),
}));

vi.mock('../diagnostics/Diagnostics', () => ({
  WorkloadDiagnosticsSection: (props: any) => {
    mockDiagnosticsSection(props);
    return null;
  },
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

describe('WorkloadDetails owned-pods diagnostics wiring', () => {
  beforeEach(() => {
    mockOwnedPodsSection.mockReset();
    mockDiagnosticsSection.mockReset();
  });

  const fakePod: any = {
    metadata: { uid: 'pod-1', namespace: 'default', name: 'nginx-1', resourceVersion: '1' },
  };
  const fakeError: any = { toString: () => 'boom' };

  function lastDiagnosticsProps() {
    return mockDiagnosticsSection.mock.calls.at(-1)?.[0];
  }

  it('forwards pods/errors from OwnedPodsSection to WorkloadDiagnosticsSection', () => {
    render(
      <TestContext>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    const onPodsUpdate = mockOwnedPodsSection.mock.calls.at(-1)?.[0]?.onPodsUpdate;
    expect(onPodsUpdate).toEqual(expect.any(Function));

    // Before any update, the diagnostics section gets no pods/errors.
    expect(lastDiagnosticsProps()).toMatchObject({ pods: null, errors: null });

    act(() => {
      onPodsUpdate(fakeDeployment, [fakePod], [fakeError]);
    });

    expect(lastDiagnosticsProps()).toMatchObject({ pods: [fakePod], errors: [fakeError] });
  });

  it('propagates a loaded-but-empty pod list so the section leaves the loading state', () => {
    render(
      <TestContext>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    const onPodsUpdate = mockOwnedPodsSection.mock.calls.at(-1)?.[0]?.onPodsUpdate;

    // null (loading) -> [] (loaded, no pods) must not be swallowed as a no-op.
    act(() => {
      onPodsUpdate(fakeDeployment, [], []);
    });

    expect(lastDiagnosticsProps().pods).toEqual([]);
  });

  it('does not re-render diagnostics when the update keys are unchanged', () => {
    render(
      <TestContext>
        <WorkloadDetails workloadKind={fakeWorkloadKind} name="nginx" namespace="default" />
      </TestContext>
    );

    const onPodsUpdate = mockOwnedPodsSection.mock.calls.at(-1)?.[0]?.onPodsUpdate;

    act(() => {
      onPodsUpdate(fakeDeployment, [fakePod], [fakeError]);
    });

    const callsAfterFirst = mockDiagnosticsSection.mock.calls.length;
    const podsAfterFirst = lastDiagnosticsProps().pods;

    // A second update carrying equal-keyed pods/errors must be a no-op.
    act(() => {
      onPodsUpdate(fakeDeployment, [{ ...fakePod }], [{ toString: () => 'boom' }]);
    });

    expect(mockDiagnosticsSection.mock.calls.length).toBe(callsAfterFirst);
    expect(lastDiagnosticsProps().pods).toBe(podsAfterFirst);
  });
});
