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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TestContext } from '../../test';
import { GraphView } from './GraphView';

const mockNodes = [
  { id: '1', type: 'resource', kubeObject: { kind: 'Pod', metadata: { labels: { env: 'prod' } } } },
  { id: '2', type: 'resource', kubeObject: { kind: 'Service', metadata: { labels: { env: '' } } } },
  {
    id: '3',
    type: 'resource',
    kubeObject: { kind: 'Deployment', metadata: { labels: { foo: 'bar' } } },
  },
];

const mocks = vi.hoisted(() => ({
  filterGraphSpy: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('./sources/GraphSources', () => ({
  useSources: () => ({
    nodes: mockNodes,
    edges: [],
    selectedSources: [],
    sourceData: new Map(),
    isLoading: false,
    toggleSelection: vi.fn(),
  }),
  GraphSourcesView: () => null,
  GraphSourceManager: ({ children }: any) => <>{children}</>,
}));

vi.mock('./sources/definitions/sources', () => ({
  useGetAllSources: () => [],
  useGetAllRelations: () => [],
}));

vi.mock('./GraphRenderer', () => ({
  GraphRenderer: ({ nodes }: any) => (
    <div data-testid="graph-renderer">{nodes?.length || 0} nodes</div>
  ),
}));

vi.mock('../common/NamespacesAutocomplete', () => ({
  NamespacesAutocomplete: () => null,
}));
vi.mock('./SelectionBreadcrumbs', () => ({
  SelectionBreadcrumbs: () => null,
}));
vi.mock('./details/GraphNodeDetails', () => ({
  GraphNodeDetails: () => null,
}));
vi.mock('./graph/graphFiltering', async importOriginal => {
  const mod = await importOriginal<any>();
  return {
    ...mod,
    filterGraph: (...args: [any, any, any]) => {
      mocks.filterGraphSpy(...args);
      return mod.filterGraph(...args);
    },
  };
});

// Mock KubeObject to prevent Class extends value undefined
vi.mock('../../lib/k8s/KubeObject', () => ({
  KubeObject: class KubeObject {
    static useList = () => [[]];
  },
}));
vi.mock('../../lib/k8s/api/v1/hooks', () => ({
  useSelectedClusters: () => ['default'],
}));
vi.mock('@mui/system/ThemeProvider', () => ({
  default: ({ children }: any) => <>{children}</>,
}));

describe('GraphView', () => {
  it('filters nodes based on label input', async () => {
    vi.useFakeTimers();
    render(
      <TestContext>
        <GraphView />
      </TestContext>
    );

    const input = await screen.findByPlaceholderText(/Labels/);

    // Type an empty value equality selector
    fireEvent.change(input, { target: { value: 'env=' } });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(mocks.filterGraphSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        expect.arrayContaining([
          expect.objectContaining({
            type: 'labelSelector',
            labels: { env: '' },
          }),
        ])
      );
    });

    // Type an existence selector
    fireEvent.change(input, { target: { value: 'env' } });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    await waitFor(() => {
      expect(mocks.filterGraphSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        expect.arrayContaining([
          expect.objectContaining({
            type: 'labelSelector',
            labels: { env: null },
          }),
        ])
      );
    });

    vi.useRealTimers();
  });
});
