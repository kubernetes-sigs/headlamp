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
import SecretList from './List';
import { BASE_SECRET } from './storyHelper';

const { mockListView, mockUseList } = vi.hoisted(() => ({
  mockListView: vi.fn(),
  mockUseList: vi.fn(),
}));

vi.mock('../../lib/k8s/secret', () => ({
  default: {
    kind: 'Secret',
    useList: mockUseList,
    getErrorMessage: (err: any) => err?.message || '',
  },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('SecretList', () => {
  beforeEach(() => {
    mockListView.mockReset();
    mockUseList.mockReset();
    mockUseList.mockReturnValue([[BASE_SECRET], null]);
  });

  it('renders with the Secret resource class and the expected columns', () => {
    render(
      <TestContext>
        <SecretList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual(['name', 'namespace', 'cluster', 'type', 'data', 'labels', 'age']);
  });

  it('correctly maps the values for custom columns', () => {
    render(
      <TestContext>
        <SecretList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const typeCol = props.columns.find((c: any) => c?.id === 'type');
    const dataCol = props.columns.find((c: any) => c?.id === 'data');

    expect(typeCol.getValue(BASE_SECRET)).toBe('test');
    expect(dataCol.getValue(BASE_SECRET)).toBe(Object.keys(BASE_SECRET.data || {}).length);
    expect(dataCol.getValue({ ...BASE_SECRET, data: {} })).toBe(0);
  });
});
