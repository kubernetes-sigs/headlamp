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
import { NetworkPolicyList } from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

describe('NetworkPolicyList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it.each([
    ['{}', {}],
    ['{ matchLabels: {} }', { matchLabels: {} }],
    ['{ matchExpressions: [] }', { matchExpressions: [] }],
    ['{ matchLabels: {}, matchExpressions: [] }', { matchLabels: {}, matchExpressions: [] }],
  ])('shows the empty pod selector %s as all pods in the namespace', (_, podSelector) => {
    render(
      <TestContext>
        <NetworkPolicyList />
      </TestContext>
    );

    const { columns } = mockListView.mock.calls[0][0];
    const column = columns.find((c: any) => c?.id === 'podSelector');
    render(<>{column.render({ jsonData: { spec: { podSelector } } })}</>);

    expect(screen.getByText('All pods in the namespace')).toBeInTheDocument();
  });
});
