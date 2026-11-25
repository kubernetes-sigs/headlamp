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
import MutatingAdmissionPolicyBindingDetails from './Details';

const { mockDetailsGrid } = vi.hoisted(() => ({ mockDetailsGrid: vi.fn() }));

vi.mock('../../lib/k8s/mutatingAdmissionPolicyBinding', () => ({
  default: { kind: 'MutatingAdmissionPolicyBinding' },
}));
vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => (mockDetailsGrid(props), null),
}));

describe('MutatingAdmissionPolicyBindingDetails', () => {
  it('handles policy binding with undefined spec safely without throwing', () => {
    render(
      <TestContext routerMap={{ name: 'my-binding' }}>
        <MutatingAdmissionPolicyBindingDetails />
      </TestContext>
    );

    const props = mockDetailsGrid.mock.calls[0][0];
    const minimalBinding: any = { metadata: { name: 'my-binding' }, jsonData: {} };

    expect(() => props.extraInfo(minimalBinding)).not.toThrow();
    expect(props.extraInfo(minimalBinding)).toBeDefined();

    expect(() => props.extraSections(minimalBinding)).not.toThrow();
    const sections = props.extraSections(minimalBinding);
    expect(sections).toHaveLength(1);
    expect(sections[0].section.props.children.props.data).toEqual([]);
  });
});
