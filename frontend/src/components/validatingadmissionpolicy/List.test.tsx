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
import ValidatingAdmissionPolicyList from './List';

const { mockResourceListView } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
}));

vi.mock('../../lib/k8s/validatingAdmissionPolicy', () => ({
  default: { kind: 'ValidatingAdmissionPolicy' },
}));

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

describe('ValidatingAdmissionPolicyList', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
  });

  it('renders ResourceListView with expected columns and configuration', () => {
    render(
      <TestContext>
        <ValidatingAdmissionPolicyList />
      </TestContext>
    );

    expect(mockResourceListView).toHaveBeenCalled();
    const props = mockResourceListView.mock.calls[0][0];
    expect(props.title).toBe('Validating Admission Policies');

    const validationsCol = props.columns.find((col: any) => col?.id === 'validations');
    expect(validationsCol).toBeDefined();

    const samplePolicy = {
      spec: {
        validations: [{ expression: 'true' }, { expression: 'false' }],
      },
    };
    expect(validationsCol.getValue(samplePolicy)).toBe(2);

    const emptyPolicy = { spec: {} };
    expect(validationsCol.getValue(emptyPolicy)).toBe(0);
  });
});
