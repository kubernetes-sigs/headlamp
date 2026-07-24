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
import { TestContext } from '../../test';
import SchedulingWorkloadList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/schedulingWorkload', () => ({
  default: { kind: 'Workload' },
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
      <SchedulingWorkloadList />
    </TestContext>
  );
  return mockListView.mock.calls[0][0];
}

const column = (props: any, id: string) => props.columns.find((c: any) => c?.id === id);

describe('SchedulingWorkloadList', () => {
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
      'podGroupTemplates',
      'controller',
      'age',
    ]);
  });

  it('offers no create button, because the base object cannot pick an API version', () => {
    expect(renderList().headerProps.titleSideActions).toEqual([]);
  });

  it('joins the names of the pod group templates', () => {
    const props = renderList();
    const templates = column(props, 'podGroupTemplates');

    expect(templates.getValue({ podGroupTemplates: [{ name: 'workers' }] })).toBe('workers');
    expect(
      templates.getValue({ podGroupTemplates: [{ name: 'workers' }, { name: 'drivers' }] })
    ).toBe('workers, drivers');
    expect(templates.getValue({ podGroupTemplates: [] })).toBe('');
  });

  it('shows the controller the workload was created for', () => {
    const props = renderList();
    const controller = column(props, 'controller');

    expect(
      controller.getValue({ spec: { controllerRef: { kind: 'Job', name: 'training' } } })
    ).toBe('Job/training');
  });

  it('shows no controller when the workload has no controller reference', () => {
    const props = renderList();

    expect(column(props, 'controller').getValue({ spec: {} })).toBe('');
  });
});
