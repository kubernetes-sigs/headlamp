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
import App from '../../App';
import type Node from '../../lib/k8s/node';
import { TestContext } from '../../test';
import NodeList, { filterNode } from './List';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  useConnectApi: vi.fn(),
}));

vi.mock('../../lib/k8s/node', () => ({
  default: class Node {
    static useMetrics = vi.fn(() => [[], null]);
    static useList = vi.fn(() => ({ items: [] }));
  },
}));

vi.mock('./Charts', () => ({
  UsageBarChart: () => null,
}));

vi.mock('./Details', () => ({
  default: () => null,
  NodeReadyLabel: () => null,
}));

vi.mock('./UpgradeVisualizationPanel', () => ({
  default: () => null,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('filterNode', () => {
  const readySchedulableNode = {
    spec: { unschedulable: false },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  } as unknown as Node;

  const readyCordonedNode = {
    spec: { unschedulable: true },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
    },
  } as unknown as Node;

  const notReadyNode = {
    spec: { unschedulable: false },
    status: {
      conditions: [{ type: 'Ready', status: 'False' }],
    },
  } as unknown as Node;

  const pendingNode = {
    spec: {},
    status: {
      conditions: [],
    },
  } as unknown as Node;

  const notReadyCordonedNode = {
    spec: { unschedulable: true },
    status: {
      conditions: [{ type: 'Ready', status: 'False' }],
    },
  } as unknown as Node;

  const nodeWithoutStatus = {
    spec: { unschedulable: false },
    status: undefined,
  } as unknown as Node;

  it('filters ready schedulable nodes correctly', () => {
    expect(filterNode(readySchedulableNode, 'Ready')).toBe(true);
    expect(filterNode(readySchedulableNode, 'ready')).toBe(true);
    expect(filterNode(readySchedulableNode, 'schedulable')).toBe(true);
    expect(filterNode(readyCordonedNode, 'Ready')).toBe(false);
    expect(filterNode(notReadyNode, 'Ready')).toBe(false);
    expect(filterNode(notReadyCordonedNode, 'Ready')).toBe(false);
    expect(filterNode(pendingNode, 'Ready')).toBe(false);
    expect(filterNode(nodeWithoutStatus, 'Ready')).toBe(false);
  });

  it('filters cordoned nodes correctly', () => {
    expect(filterNode(readyCordonedNode, 'Cordoned')).toBe(true);
    expect(filterNode(readyCordonedNode, 'cordoned')).toBe(true);
    expect(filterNode(notReadyCordonedNode, 'Cordoned')).toBe(false);
    expect(filterNode(readySchedulableNode, 'Cordoned')).toBe(false);
    expect(filterNode(notReadyNode, 'Cordoned')).toBe(false);
    expect(filterNode(nodeWithoutStatus, 'Cordoned')).toBe(false);
  });

  it('filters not ready nodes correctly', () => {
    expect(filterNode(notReadyNode, 'NotReady')).toBe(true);
    expect(filterNode(notReadyNode, 'not ready')).toBe(true);
    expect(filterNode(notReadyNode, 'not-ready')).toBe(true);
    expect(filterNode(notReadyCordonedNode, 'NotReady')).toBe(true);
    expect(filterNode(pendingNode, 'NotReady')).toBe(true);
    expect(filterNode(readySchedulableNode, 'NotReady')).toBe(false);
    expect(filterNode(nodeWithoutStatus, 'NotReady')).toBe(true);
  });

  it('returns undefined for unrelated search terms so default fuzzy column matching applies', () => {
    expect(filterNode(readySchedulableNode, 'node-1')).toBeUndefined();
    expect(filterNode(readyCordonedNode, 'node-1')).toBeUndefined();
    expect(filterNode(notReadyCordonedNode, 'node-1')).toBeUndefined();
  });
});

describe('NodeList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    render(
      <TestContext>
        <NodeList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toContain('ready');
    expect(columnIds).toContain('roles');
    expect(columnIds).toContain('version');
    expect(columnIds).toContain('software');
  });

  it('safely handles nodes with undefined status without crashing', () => {
    render(
      <TestContext>
        <NodeList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const readyCol = props.columns.find((c: any) => c?.id === 'ready');
    const rolesCol = props.columns.find((c: any) => c?.id === 'roles');
    const versionCol = props.columns.find((c: any) => c?.id === 'version');
    const softwareCol = props.columns.find((c: any) => c?.id === 'software');

    const nodeWithoutStatus = {
      status: undefined,
      getRoles: () => ['worker'],
    };

    expect(() => readyCol.getValue(nodeWithoutStatus)).not.toThrow();
    expect(readyCol.getValue(nodeWithoutStatus)).toBe('No');

    expect(() => rolesCol.getValue(nodeWithoutStatus)).not.toThrow();
    expect(rolesCol.getValue(nodeWithoutStatus)).toBe('worker');

    expect(() => versionCol.getValue(nodeWithoutStatus)).not.toThrow();
    expect(versionCol.getValue(nodeWithoutStatus)).toBeUndefined();

    expect(() => softwareCol.getValue(nodeWithoutStatus)).not.toThrow();
    expect(softwareCol.getValue(nodeWithoutStatus)).toBeUndefined();

    expect(() => softwareCol.render(nodeWithoutStatus)).not.toThrow();
    expect(softwareCol.render(nodeWithoutStatus)).toEqual(<></>);
  });
});
