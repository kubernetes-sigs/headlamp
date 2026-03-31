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

import { getGraphCacheKey, hashString } from './graphLayout';
import { GraphEdge, GraphNode } from './graphModel';

describe('hashString', () => {
  it('should produce consistent results for the same input', () => {
    const hash1 = hashString('test');
    const hash2 = hashString('test');
    expect(hash1).toBe(hash2);
  });

  it('should produce different results for different inputs', () => {
    const hash1 = hashString('abc');
    const hash2 = hashString('abd');
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different results with different seeds', () => {
    const hash1 = hashString('test', 1);
    const hash2 = hashString('test', 2);
    expect(hash1).not.toBe(hash2);
  });

  it('should chain correctly when seed is output of previous hash', () => {
    // This is how getGraphCacheKey chains calls
    const h1 = hashString('node-1', 5381);
    const h2 = hashString('node-2', h1);
    const h3 = hashString('node-2', 5381);
    // h2 should differ from h3 because the seed carries history of 'node-1'
    expect(h2).not.toBe(h3);
  });

  it('should handle empty strings', () => {
    const hash = hashString('');
    expect(hash).toBe(5381); // seed unchanged
  });
});

describe('getGraphCacheKey', () => {
  function makeGraph(nodes: { id: string }[], edges: GraphEdge[] = []): GraphNode {
    return {
      id: 'root',
      nodes: nodes.map(n => ({ id: n.id } as GraphNode)),
      edges,
    };
  }

  it('should produce the same key for the same graph', () => {
    const graph = makeGraph([{ id: 'a' }, { id: 'b' }]);
    const key1 = getGraphCacheKey(graph, 1.5);
    const key2 = getGraphCacheKey(graph, 1.5);
    expect(key1).toBe(key2);
  });

  it('should produce different keys when a node is added', () => {
    const graph1 = makeGraph([{ id: 'a' }, { id: 'b' }]);
    const graph2 = makeGraph([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should produce different keys when a node is removed', () => {
    const graph1 = makeGraph([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const graph2 = makeGraph([{ id: 'a' }, { id: 'b' }]);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should produce different keys when a node ID changes', () => {
    const graph1 = makeGraph([{ id: 'a' }, { id: 'b' }]);
    const graph2 = makeGraph([{ id: 'a' }, { id: 'c' }]);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should produce different keys when an edge is added', () => {
    const graph1 = makeGraph([{ id: 'a' }, { id: 'b' }]);
    const graph2 = makeGraph([{ id: 'a' }, { id: 'b' }], [{ id: 'e1', source: 'a', target: 'b' }]);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should produce different keys when edge direction changes', () => {
    const graph1 = makeGraph([{ id: 'a' }, { id: 'b' }], [{ id: 'e1', source: 'a', target: 'b' }]);
    const graph2 = makeGraph([{ id: 'a' }, { id: 'b' }], [{ id: 'e1', source: 'b', target: 'a' }]);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should produce different keys when aspect ratio changes', () => {
    const graph = makeGraph([{ id: 'a' }]);
    expect(getGraphCacheKey(graph, 1.5)).not.toBe(getGraphCacheKey(graph, 1.6));
  });

  it('should produce different keys when node beyond position 100 changes', () => {
    // This was the bug in the previous sampling approach
    const nodes1 = Array.from({ length: 200 }, (_, i) => ({ id: `node-${i}` }));
    const nodes2 = [...nodes1];
    nodes2[150] = { id: 'different-node' }; // Change a node beyond the old sample limit

    const graph1 = makeGraph(nodes1);
    const graph2 = makeGraph(nodes2);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should include all edges in key, not just a sample', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n-${i}` }));
    const edges1: GraphEdge[] = Array.from({ length: 200 }, (_, i) => ({
      id: `e-${i}`,
      source: `n-${i % 10}`,
      target: `n-${(i + 1) % 10}`,
    }));
    const edges2 = [...edges1];
    // Change an edge beyond position 100
    edges2[150] = { id: 'e-150', source: 'n-0', target: 'n-9' };

    const graph1 = makeGraph(nodes, edges1);
    const graph2 = makeGraph(nodes, edges2);
    expect(getGraphCacheKey(graph1, 1.5)).not.toBe(getGraphCacheKey(graph2, 1.5));
  });

  it('should handle empty graph', () => {
    const graph: GraphNode = { id: 'root' };
    const key = getGraphCacheKey(graph, 1.0);
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });
});
