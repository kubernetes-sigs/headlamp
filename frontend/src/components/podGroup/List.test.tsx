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

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import PodGroupList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/podGroup', () => ({
  default: { kind: 'PodGroup' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function renderList() {
  render(
    <TestContext>
      <PodGroupList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

const column = (props: any, id: string) => props.columns.find((c: any) => c?.id === id);

describe('PodGroupList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    const props = renderList();
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));

    expect(columnIds).toEqual([
      'name',
      'namespace',
      'cluster',
      'policy',
      'minCount',
      'workload',
      'status',
      'age',
    ]);
  });

  it('offers no create button, because the base object cannot pick an API version', () => {
    expect(renderList().headerProps.titleSideActions).toEqual([]);
  });

  it('reads the policy, min count and workload from the item', () => {
    const props = renderList();

    expect(column(props, 'policy').getValue({ policyKind: 'Gang' })).toBe('Gang');
    expect(column(props, 'minCount').getValue({ minCount: 4 })).toBe(4);
    expect(column(props, 'workload').getValue({ workloadName: 'training-job' })).toBe(
      'training-job'
    );
  });

  it('falls back to empty values when the group is not templated from a workload', () => {
    const props = renderList();

    expect(column(props, 'policy').getValue({})).toBe('');
    expect(column(props, 'minCount').getValue({})).toBeNull();
    expect(column(props, 'workload').getValue({})).toBe('');
  });

  it('shows the reason of the scheduling condition as the status', () => {
    const props = renderList();
    const status = column(props, 'status');
    const scheduled = {
      schedulingCondition: { type: 'PodGroupScheduled', status: 'True', reason: 'Scheduled' },
    };

    expect(status.getValue(scheduled)).toBe('Scheduled');

    render(<TestContext>{status.render(scheduled)}</TestContext>);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('shows an unknown status while the group has no conditions yet', () => {
    const props = renderList();
    const status = column(props, 'status');

    expect(status.getValue({})).toBe('');

    render(<TestContext>{status.render({})}</TestContext>);
    expect(screen.getByText('translation|Unknown')).toBeInTheDocument();
  });
});
