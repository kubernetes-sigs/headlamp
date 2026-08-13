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

import { act, render } from '@testing-library/react';
import React from 'react';
import ResourceListView from './ResourceListView';

const { mockHeader, mockTable } = vi.hoisted(() => ({ mockHeader: vi.fn(), mockTable: vi.fn() }));

vi.mock('../SectionFilterHeader', () => ({
  default: (props: any) => {
    mockHeader(props);
    return null;
  },
}));
vi.mock('../SectionBox', () => ({
  default: ({ children, title }: any) => (
    <>
      {title}
      {children}
    </>
  ),
}));
vi.mock('../CreateResourceButton', () => ({ CreateResourceButton: () => null }));
vi.mock('./ResourceTable', () => ({
  default: (props: any) => {
    mockTable(props);
    return null;
  },
}));

describe('ResourceListView', () => {
  beforeEach(() => {
    mockHeader.mockReset();
    mockTable.mockReset();
  });

  it('hides label filtering when data is supplied without a resource class', () => {
    render(React.createElement(ResourceListView as any, { title: 'Roles', columns: [], data: [] }));

    expect(mockHeader).toHaveBeenCalledWith(expect.objectContaining({ noLabelFilter: true }));
  });

  it('supports an explicitly enabled data-driven list and derives its label keys', () => {
    render(
      React.createElement(ResourceListView as any, {
        title: 'Pods',
        columns: [],
        data: [
          { metadata: { labels: { tier: 'frontend', app: 'checkout' } } },
          { metadata: { labels: { app: 'payments', environment: 'production' } } },
        ],
        headerProps: { noLabelFilter: false },
      })
    );

    expect(mockHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        labelKeys: ['app', 'environment', 'tier'],
        noLabelFilter: false,
      })
    );
  });

  it('shows label filtering when a resource class supplies server-side listing', () => {
    render(
      React.createElement(ResourceListView as any, {
        title: 'Pods',
        columns: [],
        resourceClass: { isNamespaced: true },
      })
    );

    expect(mockHeader).toHaveBeenCalledWith(expect.objectContaining({ noLabelFilter: false }));
  });

  it('passes label keys reported by the resource table to the filter header', () => {
    render(
      React.createElement(ResourceListView as any, {
        title: 'Pods',
        columns: [],
        resourceClass: { isNamespaced: true },
      })
    );

    act(() => mockTable.mock.calls.at(-1)![0].onLabelKeysChange(['app', 'tier']));

    expect(mockHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({ labelKeys: ['app', 'tier'] })
    );
  });
});
