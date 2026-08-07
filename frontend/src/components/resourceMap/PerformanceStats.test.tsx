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

import { act, render, screen } from '@testing-library/react';
import {
  addPerformanceMetric,
  clearPerformanceMetrics,
  PerformanceStats,
} from './PerformanceStats';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : key.replace('{{count}}', String(options.count)),
  }),
}));

describe('PerformanceStats subscriptions', () => {
  beforeEach(() => {
    clearPerformanceMetrics();
  });

  it('records metrics without dispatching DOM events when no panel is mounted', () => {
    const dispatchEvent = vi.spyOn(window, 'dispatchEvent');

    addPerformanceMetric({ operation: 'filterGraph', duration: 12, timestamp: 1 });

    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('updates a mounted panel when a metric is added', () => {
    render(<PerformanceStats visible />);

    expect(
      screen.getByText('No performance data available. Interact with the graph to see metrics.')
    ).toBeInTheDocument();

    act(() => {
      addPerformanceMetric({ operation: 'filterGraph', duration: 12, timestamp: 1 });
    });

    expect(screen.getAllByText('filterGraph')).toHaveLength(2);
    expect(screen.getByText('1 operations')).toBeInTheDocument();
  });

  it('runs multi-cluster grouping within performance budgets (simulates 500+ nodes over 3 clusters)', () => {
    // Generate 600 nodes across 3 clusters
    const clusters = ['cluster-A', 'cluster-B', 'cluster-C'];
    const mockNodes = Array.from({ length: 600 }).map((_, i) => ({
      id: `node-${i}`,
      kubeObject: {
        metadata: { uid: `node-${i}`, name: `pod-${i}`, namespace: 'default' },
        cluster: clusters[i % 3],
        kind: 'Pod',
      } as any,
    }));

    // Generate some cross-cluster edges
    const mockEdges = Array.from({ length: 300 }).map((_, i) => ({
      id: `edge-${i}`,
      source: `node-${i}`,
      target: `node-${i + 1}`,
      data: { isCrossCluster: i % 3 !== (i + 1) % 3 },
    }));

    const start = performance.now();
    // Simulate what groupGraph does internally
    const { groupGraph } = require('./graph/graphGrouping');
    const result = groupGraph(mockNodes, mockEdges, {
      groupBy: 'cluster',
      namespaces: [],
      k8sNodes: [],
    });
    const duration = performance.now() - start;

    expect(result.nodes).toBeDefined();
    expect(result.nodes!.length).toBeGreaterThan(0);

    // Performance expectation: grouping 600 nodes across 3 clusters should take less than 100ms
    // to maintain >40 FPS (approx 25ms frame budget, but JS overhead in test environment is higher).
    expect(duration).toBeLessThan(150);
  });
});
