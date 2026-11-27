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

import { ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import {
  getPodDiagnostics,
  getWorkloadDiagnostics,
  PodDiagnosticsSection,
  WorkloadDiagnosticsSection,
} from './Diagnostics';

vi.mock('../common/ObjectEventList', () => ({
  useObjectEvents: () => [],
}));

function makePod(overrides: any = {}) {
  return {
    kind: 'Pod',
    metadata: {
      name: 'web-pod',
      namespace: 'default',
      uid: 'pod-1',
      resourceVersion: '1',
    },
    spec: {
      containers: [
        { name: 'main', image: 'nginx' },
        { name: 'sidecar', image: 'busybox' },
      ],
    },
    status: {
      phase: 'Running',
      conditions: [{ type: 'Ready', status: 'True' }],
      containerStatuses: [],
    },
    cluster: 'minikube',
    ...overrides,
  } as any;
}

const theme = createMuiTheme({ name: 'test' });

describe('PodDiagnosticsSection and WorkloadDiagnosticsSection', () => {
  it('renders empty state for healthy/succeeded pod', () => {
    const pod = makePod({ status: { phase: 'Succeeded', conditions: [] } });
    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <PodDiagnosticsSection pod={pod} events={[]} />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('No active diagnostics found for this resource.')).toBeInTheDocument();
  });

  it('renders failing non-default container logs button and invokes onViewLogs', () => {
    const onViewLogs = vi.fn();
    const pod = makePod({
      status: {
        phase: 'Running',
        conditions: [{ type: 'Ready', status: 'False' }],
        containerStatuses: [
          { name: 'main', ready: true, restartCount: 0, state: { running: {} } },
          {
            name: 'sidecar',
            ready: false,
            restartCount: 2,
            state: { waiting: { reason: 'CrashLoopBackOff' } },
          },
        ],
      },
    });

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <PodDiagnosticsSection pod={pod} events={[]} onViewLogs={onViewLogs} />
        </ThemeProvider>
      </TestContext>
    );

    const logsBtn = screen.getByRole('button', { name: 'Logs: sidecar' });
    fireEvent.click(logsBtn);
    expect(onViewLogs).toHaveBeenCalledWith('sidecar');
    expect(
      screen.getByText('Previous logs may be available for restarted containers')
    ).toBeInTheDocument();
  });

  it('renders pending pod hints, warning events with series, and diagnosis hints', () => {
    const pod = makePod({
      spec: {
        containers: [{ name: 'main', image: 'nginx' }],
        nodeSelector: { 'kubernetes.io/os': 'linux' },
        affinity: { nodeAffinity: {} },
        volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'my-pvc' } }],
      },
      status: {
        phase: 'Pending',
        reason: 'Pending',
        conditions: [],
        containerStatuses: [],
      },
    });

    const events = [
      {
        type: 'Warning',
        reason: 'FailedScheduling',
        message: '0/3 nodes are available',
        series: { count: 3, lastObservedTime: '2026-05-09T05:31:00Z' },
        metadata: { uid: 'ev-1' },
      },
      {
        type: '',
        reason: 'FailedMount',
        message: 'Unable to mount volume',
        metadata: { uid: 'ev-2', creationTimestamp: '2026-05-09T05:30:00Z' },
      },
    ] as any[];

    render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <PodDiagnosticsSection pod={pod} events={events} />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('Pod scheduling event: FailedScheduling')).toBeInTheDocument();
    expect(screen.getByText('Pod has node selector constraints')).toBeInTheDocument();
    expect(screen.getByText('Pod has affinity or anti-affinity constraints')).toBeInTheDocument();
    expect(screen.getByText('Pod depends on persistent volume claims')).toBeInTheDocument();
    expect(screen.getByText('Warning event: FailedScheduling (3 times)')).toBeInTheDocument();
    expect(screen.getByText('Warning event: FailedMount')).toBeInTheDocument();
  });

  it.each([
    ['OOMKilled', /exceeding its memory limit/i],
    ['CreateContainerConfigError', /configuration is invalid/i],
    ['CreateContainerError', /could not be started/i],
    ['Evicted', /evicted due to node resource pressure/i],
    ['ContainersNotReady', /containers are not ready/i],
  ])('provides diagnosis hint for reason %s', (reason, expectedPattern) => {
    const pod = makePod({
      status: { phase: 'Failed', reason, conditions: [], containerStatuses: [] },
    });
    const diags = getPodDiagnostics(pod, []);
    expect(diags[0].message).toMatch(expectedPattern);
  });

  it('renders WorkloadDiagnosticsSection loading, error, and unschedulable pods', () => {
    const workload = {
      kind: 'Deployment',
      metadata: { name: 'web', namespace: 'default' },
      spec: { replicas: 1 },
      status: { replicas: 1, availableReplicas: 0, readyReplicas: 0 },
    } as any;

    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={theme}>
          <WorkloadDiagnosticsSection workload={workload} pods={null} />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    const unschedPod = makePod({
      status: {
        phase: 'Pending',
        conditions: [{ type: 'PodScheduled', status: 'False', reason: 'Unschedulable' }],
      },
    });

    rerender(
      <TestContext>
        <ThemeProvider theme={theme}>
          <WorkloadDiagnosticsSection
            workload={workload}
            pods={[unschedPod]}
            errors={[new Error('Forbidden') as any]}
          />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('1 pod is unschedulable')).toBeInTheDocument();
    expect(screen.getByText('Unable to load owned pods for diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Forbidden')).toBeInTheDocument();

    // Also verify singular/plural SchedulingGated and Unschedulable in getWorkloadDiagnostics
    const diags = getWorkloadDiagnostics(workload, [unschedPod, unschedPod]);
    expect(diags.some(d => d.title === '2 pods are unschedulable')).toBe(true);
  });
});
