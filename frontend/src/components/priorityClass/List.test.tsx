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
import PriorityClassList from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/priorityClass', () => ({
  default: { kind: 'PriorityClass' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('PriorityClassList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    render(
      <TestContext>
        <PriorityClassList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual(['name', 'cluster', 'value', 'globalDefault', 'labels', 'age']);
  });

  it('reads the value and global default columns from the item', () => {
    render(
      <TestContext>
        <PriorityClassList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const value = props.columns.find((c: any) => c?.id === 'value');
    const globalDefault = props.columns.find((c: any) => c?.id === 'globalDefault');

    expect(value.getValue({ value: 1000000 })).toBe(1000000);
    expect(globalDefault.getValue({ globalDefault: true })).toBe('true');
    expect(globalDefault.getValue({ globalDefault: false })).toBe('False');
  });
});
