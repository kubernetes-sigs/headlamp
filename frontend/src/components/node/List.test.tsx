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
import { TestContext } from '../../test';
import NodeList from './List';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/node', () => ({
  default: {
    kind: 'Node',
    useMetrics: vi.fn().mockReturnValue([[], null]),
    useList: vi.fn().mockReturnValue({ items: [] }),
  },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

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
  });
});
