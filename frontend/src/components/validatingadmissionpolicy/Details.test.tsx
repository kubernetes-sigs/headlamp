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
import ValidatingAdmissionPolicyDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/validatingAdmissionPolicy', () => ({
  default: { kind: 'ValidatingAdmissionPolicy' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
}));

const fakePolicy = {
  spec: {
    failurePolicy: 'Fail',
    matchConstraints: {
      matchPolicy: 'Equivalent',
    },
    paramKind: {
      apiVersion: 'rules.example.com/v1',
      kind: 'ReplicaLimit',
    },
    validations: [
      {
        expression: 'object.spec.replicas <= 5',
        message: 'Replicas must not exceed 5',
        reason: 'Invalid',
      },
    ],
    matchConditions: [
      {
        name: 'exclude-kube-system',
        expression: 'object.metadata.namespace != "kube-system"',
      },
    ],
    auditAnnotations: [
      {
        key: 'high-replica-count',
        valueExpression: 'string(object.spec.replicas)',
      },
    ],
    variables: [
      {
        name: 'maxReplicas',
        expression: '5',
      },
    ],
  },
} as any;

describe('ValidatingAdmissionPolicyDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('passes name and withEvents to DetailsGrid', () => {
    render(
      <TestContext routerMap={{ name: 'demo-policy' }}>
        <ValidatingAdmissionPolicyDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    expect(props.name).toBe('demo-policy');
    expect(props.withEvents).toBe(true);
  });

  it('renders extraInfo with failurePolicy, matchPolicy, and paramKind', () => {
    render(
      <TestContext routerMap={{ name: 'demo-policy' }}>
        <ValidatingAdmissionPolicyDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const byName = Object.fromEntries(
      props.extraInfo(fakePolicy).map((f: any) => [String(f.name).split('|').pop(), f.value])
    );

    expect(byName['Failure Policy']).toBe('Fail');
    expect(byName['Match Policy']).toBe('Equivalent');
    expect(byName['Param Kind']).toBe('rules.example.com/v1 ReplicaLimit');
  });

  it('renders extraSections with validations, matchConditions, auditAnnotations, and variables', () => {
    render(
      <TestContext routerMap={{ name: 'demo-policy' }}>
        <ValidatingAdmissionPolicyDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const extraSections = props.extraSections(fakePolicy);

    const sectionIds = extraSections.map((s: any) => s.id);
    expect(sectionIds).toContain('headlamp.validatingadmissionpolicy.validations');
    expect(sectionIds).toContain('headlamp.validatingadmissionpolicy.matchConditions');
    expect(sectionIds).toContain('headlamp.validatingadmissionpolicy.auditAnnotations');
    expect(sectionIds).toContain('headlamp.validatingadmissionpolicy.variables');
  });
});
