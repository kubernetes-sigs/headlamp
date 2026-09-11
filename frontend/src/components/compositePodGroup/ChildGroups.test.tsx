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
import ChildGroupsSection from './ChildGroups';

const { mockCompositeList, mockPodGroupList, mockTable } = vi.hoisted(() => ({
  mockCompositeList: vi.fn(),
  mockPodGroupList: vi.fn(),
  mockTable: vi.fn(),
}));

vi.mock('../../lib/k8s/compositePodGroup', () => ({
  default: { useList: mockCompositeList },
}));

vi.mock('../../lib/k8s/podGroup', () => ({
  default: { useList: mockPodGroupList },
}));

vi.mock('../common/SectionBox', () => ({
  SectionBox: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../common/SimpleTable', () => ({
  default: (props: any) => {
    mockTable(props);
    return null;
  },
}));

const group = (name: string, parent?: string) => ({
  metadata: { name, namespace: 'inference', uid: name },
  parentCompositePodGroupName: parent,
});

const parent = group('llm-serving-root') as any;

function renderSection(overrides: Partial<typeof parent> = {}) {
  render(
    <TestContext>
      <ChildGroupsSection parent={{ ...parent, ...overrides }} />
    </TestContext>
  );
}

/** Names of the rows a table was given, by the URL segment the section reflects. */
const rowNames = (reflectInURL: string) =>
  mockTable.mock.calls
    .map(([props]) => props)
    .filter(props => props.reflectInURL === reflectInURL)
    .flatMap(props => props.data.map((item: any) => item.metadata.name));

describe('ChildGroupsSection', () => {
  beforeEach(() => {
    mockTable.mockReset();
    mockCompositeList.mockReset().mockReturnValue({ items: [] });
    mockPodGroupList.mockReset().mockReturnValue({ items: [] });
  });

  it('lists both kinds of child group', () => {
    mockCompositeList.mockReturnValue({
      items: [group('llm-serving-prefill', 'llm-serving-root')],
    });
    mockPodGroupList.mockReturnValue({ items: [group('prefill-0', 'llm-serving-root')] });

    renderSection();

    expect(rowNames('childCompositePodGroups')).toEqual(['llm-serving-prefill']);
    expect(rowNames('childPodGroups')).toEqual(['prefill-0']);
  });

  it('keeps out the groups that belong to another parent', () => {
    mockCompositeList.mockReturnValue({
      items: [
        group('llm-serving-prefill', 'llm-serving-root'),
        group('other-stage', 'another-root'),
      ],
    });

    renderSection();

    expect(rowNames('childCompositePodGroups')).toEqual(['llm-serving-prefill']);
  });

  it('keeps out hierarchy roots, which have no parent at all', () => {
    mockCompositeList.mockReturnValue({ items: [parent, group('unrelated-root')] });

    renderSection();

    expect(mockTable).not.toHaveBeenCalled();
  });

  it('renders no table for a kind of child the group does not have', () => {
    mockCompositeList.mockReturnValue({
      items: [group('llm-serving-prefill', 'llm-serving-root')],
    });

    renderSection();

    expect(rowNames('childPodGroups')).toEqual([]);
  });

  it('renders nothing for a leaf composite group', () => {
    renderSection();

    expect(mockTable).not.toHaveBeenCalled();
  });

  it('tolerates a list that has not resolved yet', () => {
    mockCompositeList.mockReturnValue({ items: null });
    mockPodGroupList.mockReturnValue({ items: null });

    expect(() => renderSection()).not.toThrow();
  });

  it('scopes both lists to the namespace and cluster of the parent', () => {
    renderSection({ cluster: 'test-cluster' });

    const expected = { namespace: 'inference', cluster: 'test-cluster' };
    expect(mockCompositeList).toHaveBeenCalledWith(expected);
    expect(mockPodGroupList).toHaveBeenCalledWith(expected);
  });
});
