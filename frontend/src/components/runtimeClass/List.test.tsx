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
import { RuntimeClassList } from './List';
import { RUNTIME_CLASS_DUMMY_DATA } from './storyHelper';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/runtime', () => ({
  RuntimeClass: { kind: 'RuntimeClass' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('RuntimeClassList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the expected columns', () => {
    render(
      <TestContext>
        <RuntimeClassList />
      </TestContext>
    );

    expect(mockListView).toHaveBeenCalled();
    const props = mockListView.mock.calls[0][0];
    const columnIds = props.columns.map((c: any) => (typeof c === 'string' ? c : c.id));
    expect(columnIds).toEqual(['name', 'cluster', 'handler', 'labels', 'age']);
  });

  it('reads the handler column value from jsonData', () => {
    render(
      <TestContext>
        <RuntimeClassList />
      </TestContext>
    );

    const props = mockListView.mock.calls[0][0];
    const handler = props.columns.find((c: any) => c?.id === 'handler');
    expect(handler.getValue({ jsonData: RUNTIME_CLASS_DUMMY_DATA[0] })).toBe('handler');
  });
});
