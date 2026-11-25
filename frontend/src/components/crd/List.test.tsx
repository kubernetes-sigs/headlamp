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
import App from '../../App';
import CRD from '../../lib/k8s/crd';
import { TestContext } from '../../test';
import CustomResourceDefinitionList from './List';
import { mockCRD } from './storyHelper';

// cyclic imports fix
// eslint-disable-next-line no-unused-vars
const _dont_delete_me = App;

const { mockResourceListView, mockUseList } = vi.hoisted(() => ({
  mockResourceListView: vi.fn(),
  mockUseList: vi.fn(),
}));

vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key.split('|').pop() ?? key,
    }),
  };
});

vi.mock('../../lib/k8s/crd', async importOriginal => {
  const actual = await importOriginal<typeof import('../../lib/k8s/crd')>();
  actual.default.useList = mockUseList;
  return actual;
});

vi.mock('../common/Resource/ResourceListView', () => ({
  default: (props: any) => {
    mockResourceListView(props);
    return null;
  },
}));

describe('CustomResourceDefinitionList', () => {
  beforeEach(() => {
    mockResourceListView.mockReset();
    mockUseList.mockReset();
  });

  it('renders Group and Scope values for a populated CRD', () => {
    const populatedCRD = new CRD(mockCRD);
    mockUseList.mockReturnValue([[populatedCRD], null]);

    render(
      <TestContext>
        <CustomResourceDefinitionList />
      </TestContext>
    );

    expect(mockResourceListView).toHaveBeenCalled();
    const { columns } = mockResourceListView.mock.calls[0][0];
    const groupCol = columns.find((c: any) => c.label === 'Group');
    const scopeCol = columns.find((c: any) => c.label === 'Scope');

    expect(groupCol.getValue(populatedCRD)).toBe('my.phonyresources.io');
    expect(scopeCol.getValue(populatedCRD)).toBe('Namespaced');
  });

  it('handles a CRD with undefined spec safely without throwing', () => {
    const partialCRD = new CRD({
      apiVersion: 'apiextensions.k8s.io/v1',
      kind: 'CustomResourceDefinition',
      metadata: {
        name: 'partial.phonyresources.io',
        uid: 'partial-uid',
        creationTimestamp: '2025-01-01T00:00:00Z',
      },
    } as any);

    mockUseList.mockReturnValue([[partialCRD], null]);

    render(
      <TestContext>
        <CustomResourceDefinitionList />
      </TestContext>
    );

    expect(mockResourceListView).toHaveBeenCalled();
    const { columns } = mockResourceListView.mock.calls[0][0];
    const resourceCol = columns.find((c: any) => c.label === 'Resource');
    const groupCol = columns.find((c: any) => c.label === 'Group');
    const scopeCol = columns.find((c: any) => c.label === 'Scope');

    expect(() => resourceCol.getValue(partialCRD)).not.toThrow();
    expect(resourceCol.getValue(partialCRD)).toBe('partial.phonyresources.io');
    expect(() => groupCol.getValue(partialCRD)).not.toThrow();
    expect(groupCol.getValue(partialCRD)).toBe('');
    expect(() => scopeCol.getValue(partialCRD)).not.toThrow();
    expect(scopeCol.getValue(partialCRD)).toBe('');
  });
});
