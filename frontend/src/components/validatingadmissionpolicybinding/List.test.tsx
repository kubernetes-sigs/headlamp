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
import ValidatingAdmissionPolicyBindingList from './List';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../../lib/k8s/validatingAdmissionPolicyBinding', () => ({
  default: { kind: 'ValidatingAdmissionPolicyBinding' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

describe('ValidatingAdmissionPolicyBindingList', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('renders ResourceListView with expected columns and configuration', () => {
    render(
      <TestContext>
        <ValidatingAdmissionPolicyBindingList />
      </TestContext>
    );

    expect(mockResourceListView).toHaveBeenCalled();
    const props = mockResourceListView.mock.calls[0][0];
    expect(props.title).toBe('Validating Admission Policy Bindings');

    const policyNameCol = props.columns.find((col: any) => col?.id === 'policyName');
    expect(policyNameCol).toBeDefined();

    const validationActionsCol = props.columns.find((col: any) => col?.id === 'validationActions');
    expect(validationActionsCol).toBeDefined();

    const sampleBinding = {
      spec: {
        policyName: 'test-policy',
        validationActions: ['Deny', 'Audit'],
      },
    };
    expect(policyNameCol.getValue(sampleBinding)).toBe('test-policy');
    expect(validationActionsCol.getValue(sampleBinding)).toBe('Deny, Audit');

    const emptyBinding = { spec: {} };
    expect(policyNameCol.getValue(emptyBinding)).toBeUndefined();
    expect(validationActionsCol.getValue(emptyBinding)).toBe('');
  });
});
