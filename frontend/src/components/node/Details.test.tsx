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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KubeContainer } from '../../lib/k8s/cluster';
import { createMuiTheme } from '../../lib/themes';
import store from '../../redux/stores/store';
import { TestContext } from '../../test';
import NodeDetails, { NodeReadyLabel } from './Details';

const {
  useList,
  useGet,
  useMetrics,
  useNodeSummaryStats,
  mockApply,
  mockDrainNode,
  mockDrainNodeStatus,
  mockEnqueueSnackbar,
  renderModeRef,
  node,
} = vi.hoisted(() => {
  const sharedSpec = { podCIDR: '10.244.0.0/24', unschedulable: false, taints: [] };
  return {
    useList: vi.fn(),
    useGet: vi.fn(),
    useMetrics: vi.fn(() => [null, null]),
    useNodeSummaryStats: vi.fn(() => [null, null]),
    mockApply: vi.fn(),
    mockDrainNode: vi.fn(),
    mockDrainNodeStatus: vi.fn(),
    mockEnqueueSnackbar: vi.fn(),
    renderModeRef: { full: false },
    node: {
      metadata: { name: 'worker' },
      spec: sharedSpec,
      status: {
        allocatable: { cpu: '2', memory: '2Gi' },
        capacity: { cpu: '2', memory: '2Gi' },
        addresses: [{ type: 'InternalIP', address: '10.0.0.1' }],
        conditions: [{ type: 'Ready', status: 'True', lastTransitionTime: '2025-01-01T00:00:00Z' }],
        nodeInfo: {
          architecture: 'amd64',
          bootID: 'boot-1',
          systemUUID: 'uuid-1',
          operatingSystem: 'linux',
          osImage: 'Ubuntu 22.04',
          kernelVersion: '5.15.0',
          machineID: 'machine-1',
          kubeProxyVersion: 'v1.30.0',
          kubeletVersion: 'v1.30.0',
          containerRuntimeVersion: 'containerd://1.7.0',
        },
      },
      jsonData: {
        metadata: { name: 'worker' },
        spec: sharedSpec,
      },
      getRoles: () => ['worker'],
      getNodePool: () => 'default-pool',
    },
  };
});

vi.mock('notistack', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    useSnackbar: () => ({ enqueueSnackbar: mockEnqueueSnackbar }),
  };
});

vi.mock('../../lib/k8s/api/v1/apply', () => ({
  apply: (...args: any[]) => mockApply(...args),
}));

vi.mock('../../lib/k8s/api/v1/drainNode', () => ({
  drainNode: (...args: any[]) => mockDrainNode(...args),
  drainNodeStatus: (...args: any[]) => mockDrainNodeStatus(...args),
}));

vi.mock('../../redux/clusterActionSlice', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, any>;
  return {
    ...actual,
    clusterAction: (fn: () => Promise<void>, opts: any) => ({ type: 'CLUSTER_ACTION', fn, opts }),
  };
});

vi.mock('../cluster/Charts', () => ({
  CpuCircularChart: () => <div data-testid="cpu-chart" />,
  MemoryCircularChart: () => <div data-testid="memory-chart" />,
  PodCapacityCircularChart: () => <div data-testid="pod-chart" />,
  EphemeralStorageCircularChart: () => <div data-testid="storage-chart" />,
}));

vi.mock('./NodeShellAction', () => ({
  NodeShellAction: () => <div data-testid="node-shell-action" />,
}));

vi.mock('../../lib/k8s/node', () => ({
  default: {
    useGet: (...args: any[]) => useGet(...args),
    useMetrics: () => useMetrics(),
    useNodeSummaryStats: () => useNodeSummaryStats(),
  },
}));
vi.mock('../../lib/k8s/pod', () => ({ default: { useList } }));

// Keep the real allocation section and its table. Other node details and
// actions do not participate in resource accounting.
vi.mock('../common/Resource', () => ({
  ConditionsSection: () => <div data-testid="conditions-section" />,
  OwnedPodsSection: () => <div data-testid="owned-pods-section" />,
  MetadataDictGrid: ({ dict }: any) => (
    <div data-testid="metadata-dict">{JSON.stringify(dict)}</div>
  ),
  DetailsGrid: ({
    headerSection,
    actions,
    extraInfo,
    extraSections,
  }: {
    headerSection?: (item: any) => ReactNode;
    actions?: (item: any) => { id: string; action: ReactNode }[];
    extraInfo?: (item: any) => { name: string; value: ReactNode; hide?: boolean }[];
    extraSections: (item: any) => { id: string; section: ReactNode }[];
  }) => {
    const [currentNode] = useGet();
    if (!renderModeRef.full) {
      return extraSections(node).find(section => section.id === 'headlamp.node-resource-allocation')
        ?.section;
    }
    return (
      <div>
        {headerSection?.(currentNode)}
        <div>
          {actions?.(currentNode)?.map(a => (
            <div key={a.id}>{a.action}</div>
          ))}
        </div>
        <div>
          {extraInfo?.(currentNode)
            ?.filter(r => !r.hide)
            .map((r, i) => (
              <div key={i}>
                <span>{r.name}</span>
                <span>{r.value}</span>
              </div>
            ))}
        </div>
        {extraSections(currentNode)?.map(s => (
          <div key={s.id}>{s.section}</div>
        ))}
      </div>
    );
  },
}));

vi.mock('../common/Resource/AuthVisible', () => ({
  default: ({ children }: any) => <>{children}</>,
}));

function container(resources: KubeContainer['resources']): KubeContainer {
  return { name: 'app', image: 'nginx:stable', imagePullPolicy: 'IfNotPresent', resources };
}

function pod({
  overhead,
  containers = [
    container({
      requests: { cpu: '500m', memory: '512Mi' },
      limits: { cpu: '1', memory: '1Gi' },
    }),
  ],
  initContainers,
}: {
  overhead?: Record<string, string>;
  containers?: KubeContainer[];
  initContainers?: KubeContainer[];
} = {}) {
  // An admitted Pod includes the overhead copied from its RuntimeClass.
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'sandboxed', namespace: 'default', uid: 'pod-1' },
    spec: {
      nodeName: 'worker',
      runtimeClassName: 'sandboxed-runtime',
      containers,
      initContainers,
      overhead,
    },
    status: { phase: 'Running', conditions: [], containerStatuses: [] },
  };
}

function renderAllocation(pods: ReturnType<typeof pod>[] | null) {
  useList.mockReturnValue({ items: pods, isSuccess: true });
  render(
    <TestContext>
      <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
        <NodeDetails name="worker" cluster="cluster-a" />
      </ThemeProvider>
    </TestContext>
  );
}

function expectRow(name: string, value: string, percent: string) {
  const row = screen.getByText(name).closest('dt')?.nextElementSibling as HTMLElement | null;
  expect(row).not.toBeNull();
  expect(within(row!).getByText(value)).toBeInTheDocument();
  expect(within(row!).getByText(percent)).toBeInTheDocument();
}

describe('Node resource allocation: pod overhead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    renderModeRef.full = false;
    useGet.mockReturnValue([node, null]);
  });

  it('includes RuntimeClass overhead in requests, nonzero limits and percentages', () => {
    renderAllocation([pod({ overhead: { cpu: '250m', memory: '128Mi' } })]);
    expectRow('CPU Requests', '750 m', '37.5 %');
    expectRow('CPU Limits', '1250 m', '62.5 %');
    expectRow('Memory Requests', '640 Mi', '31.3 %');
    expectRow('Memory Limits', '1.1 Gi', '56.3 %');
  });

  it('adds overhead after taking the maximum init container requirement', () => {
    renderAllocation([
      pod({
        overhead: { cpu: '250m', memory: '128Mi' },
        initContainers: [
          container({
            requests: { cpu: '1', memory: '1Gi' },
            limits: { cpu: '1500m', memory: '1536Mi' },
          }),
        ],
      }),
    ]);
    expectRow('CPU Requests', '1250 m', '62.5 %');
    expectRow('CPU Limits', '1750 m', '87.5 %');
    expectRow('Memory Requests', '1.1 Gi', '56.3 %');
    expectRow('Memory Limits', '1.6 Gi', '81.3 %');
  });

  it('keeps an absent or zero resource limit at zero', () => {
    renderAllocation([
      pod({
        overhead: { cpu: '250m', memory: '128Mi' },
        containers: [container({ limits: { cpu: '0' } })],
      }),
    ]);
    expectRow('CPU Requests', '250 m', '12.5 %');
    expectRow('Memory Requests', '128 Mi', '6.3 %');
    expectRow('CPU Limits', '0 m', '0.0 %');
    expectRow('Memory Limits', '0 Bi', '0.0 %');
  });

  it('adds overhead only to the resource with a nonzero limit', () => {
    renderAllocation([
      pod({
        overhead: { cpu: '250m', memory: '128Mi' },
        containers: [container({ limits: { cpu: '1' } })],
      }),
    ]);
    expectRow('CPU Limits', '1250 m', '62.5 %');
    expectRow('Memory Limits', '0 Bi', '0.0 %');
  });

  it('preserves totals for pods without overhead', () => {
    renderAllocation([pod()]);
    expectRow('CPU Requests', '500 m', '25.0 %');
    expectRow('CPU Limits', '1000 m', '50.0 %');
    expectRow('Memory Requests', '512 Mi', '25.0 %');
    expectRow('Memory Limits', '1 Gi', '50.0 %');
  });

  it("sums pod totals without applying one pod's overhead to another pod's limits", () => {
    renderAllocation([
      pod(),
      pod({
        overhead: { cpu: '250m', memory: '128Mi' },
        containers: [container({ requests: { cpu: '100m', memory: '128Mi' } })],
      }),
    ]);
    expectRow('CPU Requests', '850 m', '42.5 %');
    expectRow('CPU Limits', '1000 m', '50.0 %');
    expectRow('Memory Requests', '768 Mi', '37.5 %');
    expectRow('Memory Limits', '1 Gi', '50.0 %');
  });

  it('accepts overhead for just one resource', () => {
    renderAllocation([pod({ overhead: { memory: '128Mi' } })]);
    expectRow('CPU Requests', '500 m', '25.0 %');
    expectRow('CPU Limits', '1000 m', '50.0 %');
    expectRow('Memory Requests', '640 Mi', '31.3 %');
    expectRow('Memory Limits', '1.1 Gi', '56.3 %');
  });

  it.each([null, []])('shows zero allocations with no pods (%s)', pods => {
    renderAllocation(pods);
    expectRow('CPU Requests', '0 m', '0.0 %');
    expectRow('CPU Limits', '0 m', '0.0 %');
    expectRow('Memory Requests', '0 Bi', '0.0 %');
    expectRow('Memory Limits', '0 Bi', '0.0 %');
  });
});

describe('NodeDetails sections and actions', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    renderModeRef.full = true;
    useGet.mockReturnValue([node, null]);
    useList.mockReturnValue({ items: [], isSuccess: true });
    mockApply.mockResolvedValue({});
    mockDrainNode.mockResolvedValue({});
    mockDrainNodeStatus.mockResolvedValue({ id: 'success' });
    dispatchSpy = vi.spyOn(store, 'dispatch').mockImplementation((action: any) => action);
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
  });

  it('renders charts, system info, extraInfo, and Ready/Conditions labels', () => {
    render(
      <TestContext>
        <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
          <NodeDetails name="worker" cluster="cluster-a" />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByTestId('cpu-chart')).toBeInTheDocument();
    expect(screen.getByText('amd64')).toBeInTheDocument();
    expect(screen.getByText('linux')).toBeInTheDocument();
    expect(screen.getByText('10.244.0.0/24')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    expect(screen.getByText('default-pool')).toBeInTheDocument();
    expect(screen.getByText('Scheduling Enabled')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders unschedulable drained/undrained labels and Not ready state', () => {
    const cordonedNode = {
      ...node,
      spec: { ...node.spec, unschedulable: true },
      status: { ...node.status, conditions: [], nodeInfo: undefined },
      jsonData: { ...node.jsonData, spec: { unschedulable: true } },
    };
    useGet.mockReturnValue([cordonedNode, null]);
    useList.mockReturnValue({ items: [], isSuccess: true });

    const { rerender } = render(
      <TestContext>
        <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
          <NodeDetails name="worker" cluster="cluster-a" />
        </ThemeProvider>
      </TestContext>
    );

    expect(screen.getByText('Not ready yet!')).toBeInTheDocument();
    expect(screen.getByText('Scheduling Disabled (Drained)')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();

    // With non-daemonset pod, shows Scheduling Disabled (not drained)
    useList.mockReturnValue({
      items: [pod()],
      isSuccess: true,
    });
    rerender(
      <TestContext>
        <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
          <NodeDetails name="worker" cluster="cluster-a" />
        </ThemeProvider>
      </TestContext>
    );
    expect(screen.getByText('Scheduling Disabled')).toBeInTheDocument();
  });

  it('handles cordon and drain actions with status polling', async () => {
    render(
      <TestContext>
        <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
          <NodeDetails name="worker" cluster="cluster-a" />
        </ThemeProvider>
      </TestContext>
    );

    // Click Cordon
    fireEvent.click(screen.getByRole('button', { name: 'Cordon' }));
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    await dispatchSpy.mock.calls[0][0].fn();
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { name: 'worker' },
        spec: expect.objectContaining({ unschedulable: true }),
      }),
      'cluster-a'
    );

    // Click Drain -> opens ConfirmDialog -> confirm
    mockDrainNodeStatus
      .mockResolvedValueOnce({ id: 'in-progress' })
      .mockResolvedValueOnce({ id: 'success' });

    fireEvent.click(screen.getByRole('button', { name: 'Drain' }));
    expect(screen.getByText(/Are you sure you want to drain the node worker/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    await dispatchSpy.mock.calls[1][0].fn();
    expect(mockDrainNode).toHaveBeenCalledWith('cluster-a', 'worker');
    await waitFor(() => {
      expect(mockDrainNodeStatus).toHaveBeenCalledWith('cluster-a', 'worker');
    });
    await waitFor(
      () => {
        expect(mockDrainNodeStatus).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 }
    );
  });

  it('handles drain status error and rejection', async () => {
    mockDrainNodeStatus
      .mockResolvedValueOnce({ id: 'error: failed to evict' })
      .mockRejectedValueOnce(new Error('network error'));

    render(
      <TestContext>
        <ThemeProvider theme={createMuiTheme({ name: 'test' })}>
          <NodeDetails name="worker" cluster="cluster-a" />
        </ThemeProvider>
      </TestContext>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Drain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await dispatchSpy.mock.calls[0][0].fn();

    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('error: failed to evict', {
        variant: 'error',
      });
    });

    mockEnqueueSnackbar.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Drain' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await dispatchSpy.mock.calls[1][0].fn();

    await waitFor(() => {
      expect(mockEnqueueSnackbar).toHaveBeenCalledWith('network error', {
        variant: 'error',
      });
    });
  });

  it('renders NodeReadyLabel directly for ready and not-ready nodes', () => {
    const { rerender } = render(
      <TestContext>
        <NodeReadyLabel node={node as any} />
      </TestContext>
    );
    expect(screen.getByText('Yes')).toBeInTheDocument();

    rerender(
      <TestContext>
        <NodeReadyLabel node={{ status: { conditions: [] } } as any} />
      </TestContext>
    );
    expect(screen.getByText('No')).toBeInTheDocument();
  });
});
