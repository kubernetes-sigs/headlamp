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
import MutatingAdmissionPolicyBindingList from './List';

const mockListView = vi.fn();

vi.mock('../../lib/k8s/mutatingAdmissionPolicyBinding', () => ({
  default: { kind: 'MutatingAdmissionPolicyBinding' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => (mockListView(props), null),
}));

describe('MutatingAdmissionPolicyBindingList', () => {
  beforeEach(() => {
    mockListView.mockReset();
  });

  it('renders columns and handles missing spec safely', () => {
    render(
      <TestContext>
        <MutatingAdmissionPolicyBindingList />
      </TestContext>
    );
    const cols = mockListView.mock.calls[0][0].columns;
    const col = (id: string) => cols.find((c: any) => c?.id === id);

    const item = {
      spec: { policyName: 'my-policy', paramRef: { name: 'params', namespace: 'ns' } },
    };
    expect(col('policyName').getValue(item)).toBe('my-policy');
    expect(col('paramRef').getValue(item)).toBe('ns/params');

    const minimal = {};
    expect(col('policyName').getValue(minimal)).toBeUndefined();
    expect(col('paramRef').getValue(minimal)).toBe('N/A');
  });
});
