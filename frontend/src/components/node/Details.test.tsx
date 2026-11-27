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
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import type { KubeContainer } from '../../lib/k8s/cluster';
import Node from '../../lib/k8s/node';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import { lightTheme } from '../App/defaultAppThemes';
import NodeDetails from './Details';

const theme = createMuiTheme(lightTheme);

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { useList, allocationNode, mockDetailsGrid, mockState } = vi.hoisted(() => ({
  useList: vi.fn().mockReturnValue([[], null]),
  allocationNode: {
    metadata: { name: 'worker' },
    status: { allocatable: { cpu: '2', memory: '2Gi' } },
  },
  mockDetailsGrid: vi.fn(),
  mockState: {
    renderAllocationSection: false,
  },
}));

vi.mock('../../lib/k8s/node', async () => {
  const actual = await vi.importActual<typeof import('../../lib/k8s/node')>('../../lib/k8s/node');
  actual.default.useMetrics = vi.fn(() => [
    mockState.renderAllocationSection ? null : [],
    null,
  ]) as any;
  actual.default.useNodeSummaryStats = vi.fn().mockReturnValue([null, null]) as any;
  actual.default.useGet = vi.fn(() => [
    mockState.renderAllocationSection ? allocationNode : null,
    null,
  ]) as any;
  return actual;
});

vi.mock('../../lib/k8s/pod', () => ({ default: { useList } }));

// Keep the real allocation section and its table when testing resource accounting,
// and capture DetailsGrid props for NodeDetails unit tests.
vi.mock('../common/Resource', () => ({
  ConditionsSection: () => <div data-testid="conditions-section" />,
  OwnedPodsSection: () => <div data-testid="owned-pods-section" />,
  MetadataDictGrid: () => <div data-testid="metadata-dict-grid" />,
  DetailsGrid: (props: {
    extraSections: (item: typeof allocationNode) => { id: string; section: ReactNode }[];
  }) => {
    mockDetailsGrid(props);
    if (mockState.renderAllocationSection) {
      return (
        props
          .extraSections(allocationNode)
          .find(section => section.id === 'headlamp.node-resource-allocation')?.section ?? null
      );
    }
    return null;
  },
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
  mockState.renderAllocationSection = true;
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
    mockState.renderAllocationSection = true;
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

function renderWithTheme(ui: React.ReactElement, routerMap?: Record<string, string>) {
  return render(
    <ThemeProvider theme={theme}>
      <TestContext routerMap={routerMap}>{ui}</TestContext>
    </ThemeProvider>
  );
}

describe('NodeDetails', () => {
  const makeNodeWithoutStatus = () =>
    new Node({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: {
        name: 'node-without-status',
        creationTimestamp: '2022-01-01T00:00:00Z',
        uid: 'node-without-status-uid',
      },
      spec: {
        podCIDR: '10.244.0.0/24',
        taints: [],
      },
    });

  beforeEach(() => {
    mockDetailsGrid.mockReset();
    mockState.renderAllocationSection = false;
    useList.mockReturnValue([[], null]);
  });

  it('passes Node resource and route params to DetailsGrid', () => {
    renderWithTheme(<NodeDetails name="test-node" />, { name: 'test-node' });

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('test-node');
    expect(props.resourceType).toBe(Node);
  });

  describe('when node status is undefined (regression test)', () => {
    it('safely builds extraInfo without throwing or crashing on missing status', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.extraInfo(node)).not.toThrow();
      const extraInfo = props.extraInfo(node);
      expect(Array.isArray(extraInfo)).toBe(true);

      const readyField = extraInfo.find((f: any) => String(f.name).includes('Ready'));
      expect(readyField).toBeDefined();

      const { container } = renderWithTheme(readyField.value);
      expect(container.textContent).toContain('No');
    });

    it('safely renders headerSection (ChartsSection) without throwing on missing status conditions', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.headerSection(node)).not.toThrow();

      renderWithTheme(props.headerSection(node));
      expect(screen.getByText('Not ready yet!')).toBeInTheDocument();
    });

    it('safely handles extraSections (AllocatedResources, SystemInfo) without crashing', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.extraSections(node)).not.toThrow();
      const sections = props.extraSections(node);
      expect(sections).toHaveLength(4);

      const allocationSection = sections.find(
        (s: any) => s.id === 'headlamp.node-resource-allocation'
      );
      expect(allocationSection).toBeDefined();
      expect(() => renderWithTheme(allocationSection.section)).not.toThrow();

      const systemInfoSection = sections.find((s: any) => s.id === 'headlamp.node-system-info');
      expect(systemInfoSection).toBeDefined();
      const { container: sysContainer } = renderWithTheme(systemInfoSection.section);
      expect(sysContainer).toBeEmptyDOMElement();
    });

    it('safely handles actions without throwing when node status is omitted', () => {
      renderWithTheme(<NodeDetails name="node-without-status" />, { name: 'node-without-status' });

      const props = mockDetailsGrid.mock.calls[0][0];
      const node = makeNodeWithoutStatus();

      expect(() => props.actions(node)).not.toThrow();
      const actions = props.actions(node);
      expect(actions.length).toBeGreaterThan(0);
    });
  });
});
