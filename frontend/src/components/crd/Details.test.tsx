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
import CustomResourceDefinitionDetails from './Details';
import { mockCRD } from './storyHelper';

vi.mock('react-i18next', async importOriginal => {
  const actual: any = await importOriginal();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key.split('|').pop() ?? key,
    }),
  };
});

const { mockDetailsGrid } = vi.hoisted(() => ({
  mockDetailsGrid: vi.fn(),
}));

vi.mock('../../lib/k8s/crd', () => ({
  default: { kind: 'CustomResourceDefinition' },
}));

vi.mock('../common/Resource', () => ({
  DetailsGrid: (props: any) => {
    mockDetailsGrid(props);
    return null;
  },
  ConditionsTable: () => null,
}));

describe('CustomResourceDefinitionDetails', () => {
  beforeEach(() => {
    mockDetailsGrid.mockReset();
  });

  it('uses the served field for the Served column and the storage field for the Storage column', () => {
    render(
      <TestContext routerMap={{ name: 'mydefinition.phonyresources.io' }}>
        <CustomResourceDefinitionDetails />
      </TestContext>
    );

    expect(mockDetailsGrid).toHaveBeenCalled();
    const props = mockDetailsGrid.mock.calls[0][0];
    const sections = props.extraSections(mockCRD);

    const versionsSection = sections.find((section: any) => section.id === 'headlamp.crd-versions');

    expect(versionsSection).toBeDefined();

    const table = versionsSection.section.props.children;
    const columns = table.props.columns;

    const servedColumn = columns.find((c: any) => c.label === 'Served');
    const storageColumn = columns.find((c: any) => c.label === 'Storage');

    expect(servedColumn).toBeDefined();
    expect(storageColumn).toBeDefined();

    const versionA = {
      name: 'v1',
      served: true,
      storage: false,
    };

    const versionB = {
      name: 'v1',
      served: false,
      storage: true,
    };

    expect(servedColumn.getter(versionA)).toBe('true');
    expect(storageColumn.getter(versionA)).toBe('false');

    expect(servedColumn.getter(versionB)).toBe('false');
    expect(storageColumn.getter(versionB)).toBe('true');
  });
});
