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

import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KubeMetrics } from '../../lib/k8s/cluster';
import Node from '../../lib/k8s/node';
import { createMuiTheme } from '../../lib/themes';
import { TestContext } from '../../test';
import NodeList from './List';

const theme = createMuiTheme({ base: 'light', name: 'light' });

// Recharts has no size in jsdom, so show the numbers the bar is given instead.
vi.mock('../common/Chart', async importOriginal => ({
  ...(await importOriginal<typeof import('../common/Chart')>()),
  PercentageBar: ({ data, total }: { data: { value: number }[]; total: number }) => (
    <span data-testid="usage">{`${data[0].value}/${total}`}</span>
  ),
}));

vi.mock('./UpgradeVisualizationPanel', () => ({ default: () => null }));

function makeNode(name: string) {
  return new Node(
    {
      kind: 'Node',
      apiVersion: 'v1',
      metadata: { name, uid: name, creationTimestamp: '2025-01-01T00:00:00Z' },
      spec: {},
      status: {
        capacity: { cpu: '4', memory: '8Gi' },
        conditions: [{ type: 'Ready', status: 'True' }],
        addresses: [],
        nodeInfo: {},
      },
    } as any,
    'cluster-a'
  );
}

function makeMetrics(name: string, cpu: string, memory: string): KubeMetrics {
  return { metadata: { name }, usage: { cpu, memory } } as unknown as KubeMetrics;
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// A new element each time, so that rerender renders NodeList again like a state update does.
const view = () => (
  <QueryClientProvider client={queryClient}>
    <TestContext>
      <ThemeProvider theme={theme}>
        <NodeList />
      </ThemeProvider>
    </TestContext>
  </QueryClientProvider>
);

describe('NodeList usage bars', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills the CPU and memory bars when the metrics arrive after the list was rendered', async () => {
    const items = [makeNode('node-1')];
    vi.spyOn(Node, 'useList').mockReturnValue({ items } as unknown as ReturnType<
      typeof Node.useList
    >);
    const useMetrics = vi.spyOn(Node, 'useMetrics').mockReturnValue([null, null]);

    const { rerender } = render(view());

    await waitFor(() => expect(screen.getAllByTestId('usage')).toHaveLength(2));
    expect(screen.getAllByTestId('usage')[0].textContent).toBe('0/4000000000');
    expect(screen.getAllByTestId('usage')[1].textContent).toBe('0/8589934592');

    // The metrics request finishes after the nodes request, as in the report.
    useMetrics.mockReturnValue([[makeMetrics('node-1', '2', '1Gi')], null]);
    rerender(view());

    await waitFor(() => {
      const bars = screen.getAllByTestId('usage');
      expect(bars[0].textContent).toBe('2000000000/4000000000');
      expect(bars[1].textContent).toBe('1073741824/8589934592');
    });
  });

  it('keeps the bars up to date on every metrics poll', async () => {
    const items = [makeNode('node-1')];
    vi.spyOn(Node, 'useList').mockReturnValue({ items } as unknown as ReturnType<
      typeof Node.useList
    >);
    const useMetrics = vi
      .spyOn(Node, 'useMetrics')
      .mockReturnValue([[makeMetrics('node-1', '1', '1Gi')], null]);

    const { rerender } = render(view());

    await waitFor(() => {
      const bars = screen.getAllByTestId('usage');
      expect(bars[0].textContent).toBe('1000000000/4000000000');
      expect(bars[1].textContent).toBe('1073741824/8589934592');
    });

    useMetrics.mockReturnValue([[makeMetrics('node-1', '3', '2Gi')], null]);
    rerender(view());

    await waitFor(() => {
      const bars = screen.getAllByTestId('usage');
      expect(bars[0].textContent).toBe('3000000000/4000000000');
      expect(bars[1].textContent).toBe('2147483648/8589934592');
    });
  });
});
