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
import BackendTrafficPolicyList from './BackendTrafficPolicyList';

const { mockListView } = vi.hoisted(() => ({
  mockListView: vi.fn(),
}));

vi.mock('../../lib/k8s/backendTrafficPolicy', () => ({
  default: { kind: 'XBackendTrafficPolicy' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockListView(props);
    return null;
  },
}));

function getRetryConstraintColumn() {
  const props = mockListView.mock.calls[0][0];
  return props.columns.find((c: any) => c?.id === 'retryConstraint');
}

function renderedLabel(column: any, policy: any) {
  render(column.render(policy));
  return screen.getByText((_, node) => node?.tagName === 'SPAN').textContent;
}

describe('BackendTrafficPolicyList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders the fully specified budget as-is', () => {
    render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const column = getRetryConstraintColumn();
    const policy = { retryConstraint: { budget: { percent: 10, interval: '30s' } } } as any;

    expect(column.getValue(policy)).toBe('Retry 10% per 30s');
    expect(renderedLabel(column, policy)).toBe('Retry 10% per 30s');
  });

  it('falls back to the documented defaults when percent and interval are both omitted', () => {
    render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const column = getRetryConstraintColumn();
    const policy = { retryConstraint: { budget: {} } } as any;

    expect(column.getValue(policy)).toBe('Retry 20% per 10s');
    expect(renderedLabel(column, policy)).toBe('Retry 20% per 10s');
  });

  it('falls back to the default interval only when interval is omitted', () => {
    render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const column = getRetryConstraintColumn();
    const policy = { retryConstraint: { budget: { percent: 10 } } } as any;

    expect(column.getValue(policy)).toBe('Retry 10% per 10s');
    expect(renderedLabel(column, policy)).toBe('Retry 10% per 10s');
  });

  it('falls back to the default percent only when percent is omitted', () => {
    render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const column = getRetryConstraintColumn();
    const policy = { retryConstraint: { budget: { interval: '30s' } } } as any;

    expect(column.getValue(policy)).toBe('Retry 20% per 30s');
    expect(renderedLabel(column, policy)).toBe('Retry 20% per 30s');
  });

  it('shows a dash when there is no retry budget at all', () => {
    render(
      <TestContext>
        <BackendTrafficPolicyList />
      </TestContext>
    );

    const column = getRetryConstraintColumn();
    const policy = { retryConstraint: undefined } as any;

    expect(column.getValue(policy)).toBe('—');
    expect(renderedLabel(column, policy)).toBe('—');
  });
});
