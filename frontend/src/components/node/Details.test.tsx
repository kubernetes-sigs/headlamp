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
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KubeContainer } from '../../lib/k8s/cluster';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import NodeDetails from './Details';

const { useList, node } = vi.hoisted(() => ({
  useList: vi.fn(),
  node: {
    metadata: { name: 'worker' },
    status: { allocatable: { cpu: '2', memory: '2Gi' } },
  },
}));

vi.mock('../../lib/k8s/node', () => ({
  default: {
    useGet: () => [node, null],
    useMetrics: () => [null, null],
    useNodeSummaryStats: () => [null, null],
  },
}));
vi.mock('../../lib/k8s/pod', () => ({ default: { useList } }));

// Keep the real allocation section and its table. Other node details and
// actions do not participate in resource accounting.
vi.mock('../common/Resource', () => ({
  ConditionsSection: () => null,
  OwnedPodsSection: () => null,
  MetadataDictGrid: () => null,
  DetailsGrid: ({
    extraSections,
  }: {
    extraSections: (item: typeof node) => { id: string; section: ReactNode }[];
  }) =>
    extraSections(node).find(section => section.id === 'headlamp.node-resource-allocation')
      ?.section,
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
  beforeEach(() => vi.clearAllMocks());

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
