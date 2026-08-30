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
import ValidatingAdmissionPolicyBindingDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/validatingAdmissionPolicyBinding', () => ({
  default: { kind: 'ValidatingAdmissionPolicyBinding' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const fakeBinding = {
  spec: {
    policyName: 'demo-policy',
    validationActions: ['Deny', 'Warn'],
    matchResources: {
      matchPolicy: 'Equivalent',
    },
    paramRef: {
      name: 'demo-param',
      namespace: 'demo-namespace',
      parameterNotFoundAction: 'Deny',
    },
  },
} as any;

describe('ValidatingAdmissionPolicyBindingDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes name and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ name: 'demo-binding' }}>
        <ValidatingAdmissionPolicyBindingDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('demo-binding');
    expect(props.withEvents).toBe(true);
  });

  it('renders extraInfo with policyName, validationActions, matchPolicy, and paramRef details', () => {
    render(
      <TestContext routerMap={{ name: 'demo-binding' }}>
        <ValidatingAdmissionPolicyBindingDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(
      props.extraInfo(fakeBinding).map((f: any) => [String(f.name).split('|').pop(), f.value])
    );

    expect(byName['Validation Actions']).toBe('Deny, Warn');
    expect(byName['Match Policy']).toBe('Equivalent');
    expect(byName['Param Ref Name']).toBe('demo-param');
    expect(byName['Param Ref Namespace']).toBe('demo-namespace');
    expect(byName['Parameter Not Found Action']).toBe('Deny');
    expect(byName['Policy Name']).toBeDefined();
  });
});
