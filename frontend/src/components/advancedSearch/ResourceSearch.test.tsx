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

import { render, screen } from '@testing-library/react';
import React from 'react';
import { vi } from 'vitest';
import { TestContext } from '../../test';
import { ResourceSearch } from './ResourceSearch';
import { searchWithQuery } from './utils/searchWithQuery';
import { useKubeLists } from './utils/useKubeLists';
import { useTypeDefinition } from './utils/useTypeDefinition';

vi.mock('./utils/useKubeLists');
vi.mock('./utils/searchWithQuery');
vi.mock('./utils/useTypeDefinition');
vi.mock('@monaco-editor/react', () => ({
  Editor: () => <div data-testid="mock-editor" />,
  useMonaco: () => null,
}));
vi.mock('@iconify/react', () => ({
  Icon: () => <span />,
}));
vi.mock('../common/Resource/ResourceTable', () => ({
  __esModule: true,
  default: ({ data = [] }: { data?: any[] }) => (
    <table data-testid="resource-table">
      <tbody>
        {data.map((item, index) => (
          <tr key={item.metadata?.uid || index}>
            <td>{item.kind}</td>
            <td>{item.metadata?.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));
vi.mock('../activity/Activity', () => ({
  Activity: {
    launch: vi.fn(),
  },
}));

describe('ResourceSearch', () => {
  const mockResources = [
    {
      kind: 'Pod',
      name: 'pods',
      singularName: 'pod',
      namespaced: true,
      verbs: ['get', 'list'],
    },
  ] as any;

  const mockSelectedClusters = ['cluster-1'];

  beforeEach(() => {
    vi.clearAllMocks();
    (useTypeDefinition as any).mockReturnValue('type Global = any;');
  });

  test('renders loading state', () => {
    (useKubeLists as any).mockReturnValue({
      items: [],
      errors: [],
      isLoading: true,
    });
    (searchWithQuery as any).mockResolvedValue({ results: [], total: 0 });

    render(
      <TestContext>
        <ResourceSearch
          resources={mockResources}
          selectedClusters={mockSelectedClusters}
          rawQuery=""
          maxItemsPerResource={10}
          refetchIntervalMs={0}
          setRawQuery={vi.fn()}
        />
      </TestContext>
    );

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  test('renders empty state when no query', () => {
    (useKubeLists as any).mockReturnValue({
      items: [],
      errors: [],
      isLoading: false,
    });
    (searchWithQuery as any).mockResolvedValue({ results: [], total: 0 });

    render(
      <TestContext>
        <ResourceSearch
          resources={mockResources}
          selectedClusters={mockSelectedClusters}
          rawQuery=""
          maxItemsPerResource={10}
          refetchIntervalMs={0}
          setRawQuery={vi.fn()}
        />
      </TestContext>
    );

    expect(screen.getByText(/Loaded 0 items/i)).toBeInTheDocument();
    expect(screen.queryByTestId('resource-table')).not.toBeInTheDocument();
  });

  test('renders results when query matches', async () => {
    const mockItems = [
      {
        kind: 'Pod',
        metadata: { name: 'test-pod', namespace: 'default', uid: '123' },
        cluster: 'cluster-1',
        jsonData: { metadata: { name: 'test-pod', namespace: 'default' } },
      },
    ];

    (useKubeLists as any).mockReturnValue({
      items: mockItems,
      errors: [],
      isLoading: false,
    });
    (searchWithQuery as any).mockResolvedValue({ results: mockItems, total: 1 });

    render(
      <TestContext>
        <ResourceSearch
          resources={mockResources}
          selectedClusters={mockSelectedClusters}
          rawQuery="test"
          maxItemsPerResource={10}
          refetchIntervalMs={0}
          setRawQuery={vi.fn()}
        />
      </TestContext>
    );

    // Results are rendered when rawQuery is not empty and results are ready
    const table = await screen.findByTestId('resource-table');
    expect(table).toBeInTheDocument();
    expect(screen.getByText('test-pod')).toBeInTheDocument();
  });

  test('renders error state when some resources fail to load', () => {
    (useKubeLists as any).mockReturnValue({
      items: [],
      errors: [{ resource: mockResources[0], error: 'failed' }],
      isLoading: false,
    });
    (searchWithQuery as any).mockResolvedValue({ results: [], total: 0 });

    render(
      <TestContext>
        <ResourceSearch
          resources={mockResources}
          selectedClusters={mockSelectedClusters}
          rawQuery=""
          maxItemsPerResource={10}
          refetchIntervalMs={0}
          setRawQuery={vi.fn()}
        />
      </TestContext>
    );

    expect(screen.getByText(/Some resources failed to load/i)).toBeInTheDocument();
  });
});
