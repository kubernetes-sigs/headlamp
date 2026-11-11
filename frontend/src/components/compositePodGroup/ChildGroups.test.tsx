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

import '../../i18n/config';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/k8s/api/v2/ApiError';
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
    .flatMap(props => (props.data ?? []).map((item: any) => item.metadata.name));

/** The props of the last table rendered for the section reflected at the given segment. */
const lastTable = (reflectInURL: string) =>
  mockTable.mock.calls
    .map(([props]) => props)
    .filter(props => props.reflectInURL === reflectInURL)
    .at(-1);

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

  it.each(['composite', 'pod'])(
    'shows a stopped %s watch even when the last successful child list was empty',
    kind => {
      const warning = new ApiError('Child group updates have stopped', { cluster: 'test' });
      const list = kind === 'composite' ? mockCompositeList : mockPodGroupList;
      list.mockReturnValue({
        items: [],
        isLoading: false,
        isError: false,
        watchErrors: [warning],
      });

      renderSection();

      expect(screen.getByRole('alert')).toHaveTextContent(warning.message);
      expect(
        lastTable(kind === 'composite' ? 'childCompositePodGroups' : 'childPodGroups')
      ).toMatchObject({ data: [], errorMessage: undefined });
    }
  );

  it('tolerates a list that has not resolved yet', () => {
    mockCompositeList.mockReturnValue({ items: null });
    mockPodGroupList.mockReturnValue({ items: null });

    expect(() => renderSection()).not.toThrow();
  });

  it.each(['composite', 'pod'])(
    'retains cached %s children alongside a failed recovery LIST',
    kind => {
      const error = new ApiError('Child group recovery LIST failed', { cluster: 'test' });
      const list = kind === 'composite' ? mockCompositeList : mockPodGroupList;
      list.mockReturnValue({
        items: [group('retained-child', 'llm-serving-root')],
        isLoading: false,
        isError: true,
        errors: [error],
        watchErrors: [],
      });

      renderSection();

      fireEvent.click(screen.getByRole('button', { name: 'Show details' }));
      expect(screen.getByRole('alert')).toHaveTextContent(error.message);
      expect(
        lastTable(kind === 'composite' ? 'childCompositePodGroups' : 'childPodGroups')
      ).toMatchObject({
        data: [group('retained-child', 'llm-serving-root')],
        errorMessage: undefined,
      });
    }
  );

  it('shows a loading table while a list has not finished', () => {
    mockCompositeList.mockReturnValue({ items: null, isLoading: true });

    renderSection();

    expect(lastTable('childCompositePodGroups')).toMatchObject({
      data: null,
      errorMessage: undefined,
    });
  });

  it('reports a failed list instead of presenting the group as a leaf', () => {
    // A failed list returns no items, so without this a user who may not list the
    // children would see the group as having none.
    mockCompositeList.mockReturnValue({ items: [], isError: true });

    renderSection();

    expect(lastTable('childCompositePodGroups')).toMatchObject({
      data: null,
      errorMessage: 'Unable to list the child groups.',
    });
  });

  it('keeps showing the kind that listed when the other kind fails', () => {
    mockCompositeList.mockReturnValue({ items: [], isError: true });
    mockPodGroupList.mockReturnValue({ items: [group('prefill-0', 'llm-serving-root')] });

    renderSection();

    expect(lastTable('childCompositePodGroups').errorMessage).toBe(
      'Unable to list the child groups.'
    );
    expect(rowNames('childPodGroups')).toEqual(['prefill-0']);
    expect(lastTable('childPodGroups').errorMessage).toBeUndefined();
  });

  it('shows the children that loaded even when the list reports an error', () => {
    mockPodGroupList.mockReturnValue({
      items: [group('prefill-0', 'llm-serving-root')],
      isError: true,
    });

    renderSection();

    expect(rowNames('childPodGroups')).toEqual(['prefill-0']);
    expect(lastTable('childPodGroups').errorMessage).toBeUndefined();
  });

  it('scopes both lists to the namespace and cluster of the parent', () => {
    renderSection({ cluster: 'test-cluster' });

    const expected = { namespace: 'inference', cluster: 'test-cluster' };
    expect(mockCompositeList).toHaveBeenCalledWith(expected);
    expect(mockPodGroupList).toHaveBeenCalledWith(expected);
  });
});
