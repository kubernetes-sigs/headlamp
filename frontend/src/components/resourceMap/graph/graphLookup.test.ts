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

import { describe, expect, it } from 'vitest';
import { makeGraphLookup } from './graphLookup';
import { GraphEdge, GraphNode } from './graphModel';

describe('GraphLookup', () => {
  const nodes: GraphNode[] = [
    { id: '1', data: {} as any },
    { id: '2', data: {} as any },
    { id: '3', data: {} as any },
  ];

  const edges: GraphEdge[] = [
    { id: 'e1', source: '1', target: '2' },
    { id: 'e2', source: '2', target: '3' },
    { id: 'e3', source: '1', target: '3' },
  ];

  const graphLookup = makeGraphLookup(nodes, edges);

  it('should get outgoing edges for a node', () => {
    const outgoingEdges = graphLookup.getOutgoingEdges('1');
    expect(outgoingEdges).toEqual([
      { id: 'e1', source: '1', target: '2' },
      { id: 'e3', source: '1', target: '3' },
    ]);
  });

  it('should get incoming edges for a node', () => {
    const incomingEdges = graphLookup.getIncomingEdges('3');
    expect(incomingEdges).toEqual([
      { id: 'e2', source: '2', target: '3' },
      { id: 'e3', source: '1', target: '3' },
    ]);
  });

  it('should get a node by its ID', () => {
    const node = graphLookup.getNode('2');
    expect(node).toEqual({ id: '2', data: {} });
  });

  it('should return undefined for non-existent node ID', () => {
    const node = graphLookup.getNode('non-existent');
    expect(node).toBeUndefined();
  });

  it('should return undefined for outgoing edges of non-existent node ID', () => {
    const outgoingEdges = graphLookup.getOutgoingEdges('non-existent');
    expect(outgoingEdges).toBeUndefined();
  });

  it('should return undefined for incoming edges of non-existent node ID', () => {
    const incomingEdges = graphLookup.getIncomingEdges('non-existent');
    expect(incomingEdges).toBeUndefined();
  });
});
