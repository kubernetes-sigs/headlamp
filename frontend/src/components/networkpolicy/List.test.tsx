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
import { NetworkPolicyList } from './List';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s', () => ({
  matchExpressionSimplifier: vi.fn(() => []),
  matchLabelsSimplifier: vi.fn(() => []),
}));

vi.mock('../../lib/k8s/networkpolicy', () => ({
  default: { kind: 'NetworkPolicy' },
}));

vi.mock('../common/Resource/MatchExpressions', () => ({
  MatchExpressions: () => null,
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function getColumn(id: string) {
  const props = mockListView.mock.calls[0][0];
  return props.columns.find((c: any) => c?.id === id);
}

describe('NetworkPolicyList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('derives Type from policyTypes, not from rule array presence', () => {
    render(
      <TestContext>
        <NetworkPolicyList />
      </TestContext>
    );

    const typeColumn = getColumn('type');

    // Deny-all ingress: policyTypes set, no ingress rules.
    expect(
      typeColumn.getValue({
        policyTypes: ['Ingress'],
        jsonData: { spec: { podSelector: {} } },
      })
    ).toBe('Ingress');

    // Deny-all egress: policyTypes set, no egress rules.
    expect(
      typeColumn.getValue({
        policyTypes: ['Egress'],
        jsonData: { spec: { podSelector: {} } },
      })
    ).toBe('Egress');

    expect(
      typeColumn.getValue({
        policyTypes: ['Ingress', 'Egress'],
        jsonData: { spec: { podSelector: {} } },
      })
    ).toBe('Ingress and Egress');

    expect(
      typeColumn.getValue({
        policyTypes: [],
        jsonData: { spec: { podSelector: {} } },
      })
    ).toBe('None');
  });
});
