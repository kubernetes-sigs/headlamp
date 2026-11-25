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
import { describe, expect, it, vi } from 'vitest';
import { TestContext } from '../../test';
import MutatingAdmissionPolicyDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({ mockDetailsGrid: vi.fn() }));

vi.mock('../../lib/k8s/mutatingAdmissionPolicy', () => ({
  default: { kind: 'MutatingAdmissionPolicy' },
}));
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => (mockDetailsGrid(props), null),
  ConditionsTable: () => null,
}));

describe('MutatingAdmissionPolicyDetails', () => {
  it('handles policy with undefined spec safely without throwing', () => {
    render(
      <TestContext routerMap={{ name: 'my-policy' }}>
        <MutatingAdmissionPolicyDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const minimalPolicy: any = { metadata: { name: 'my-policy' }, jsonData: {} };

    expect(() => props.extraInfo(minimalPolicy)).not.toThrow();
    expect(props.extraInfo(minimalPolicy)).toBeDefined();

    expect(() => props.extraSections(minimalPolicy)).not.toThrow();
    const sections = props.extraSections(minimalPolicy);
    const data = sections.slice(0, 3).map((s: any) => s.section.props.children.props.data);
    expect(data).toEqual([[], [], []]);
  });
});
