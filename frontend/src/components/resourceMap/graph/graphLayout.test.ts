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

import { GraphNode } from './graphModel';

const mocks = vi.hoisted(() => ({
  constructorError: undefined as Error | undefined,
  layout: vi.fn(),
}));

vi.mock('elkjs/lib/elk-api', () => ({
  default: class MockELK {
    constructor(options: unknown) {
      if (mocks.constructorError) throw mocks.constructorError;
      expect(options).toEqual({ defaultLayoutOptions: {}, workerUrl: 'mock-worker-url' });
    }

    layout = mocks.layout;
  },
}));

vi.mock('elkjs/lib/elk-worker.min.js?url', () => ({ default: 'mock-worker-url' }));

describe('applyGraphLayout', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.constructorError = undefined;
  });

  it('converts graph input to ELK and converts the layout result to React Flow', async () => {
    const graph: GraphNode = {
      id: 'root',
      data: { root: true },
      nodes: [
        {
          id: 'group',
          data: { group: true },
          nodes: [
            { id: 'pod', weight: 800, data: { kind: 'Pod' } },
            { id: 'service', data: { kind: 'Service' } },
          ],
          edges: [
            {
              id: 'valid-edge',
              source: 'pod',
              target: 'service',
              label: 'routes',
              data: { protocol: 'TCP' },
            },
            { id: 'invalid-edge', source: 'pod', target: 'missing' },
          ],
        },
      ],
    };
    mocks.layout.mockImplementation(async elkGraph => {
      expect(elkGraph).toMatchObject({
        id: 'root',
        type: 'object',
        width: 220,
        height: 70,
        layoutOptions: {
          'elk.algorithm': 'rectpacking',
          'elk.rectpacking.widthApproximation.optimizationGoal': 'ASPECT_RATIO_DRIVEN',
        },
        edges: [],
        children: [
          {
            id: 'group',
            layoutOptions: {
              'partitioning.activate': 'true',
              'elk.algorithm': 'layered',
            },
            edges: [
              {
                id: 'valid-edge',
                sources: ['pod'],
                targets: ['service'],
                label: 'routes',
                labels: [{ text: 'routes', width: 70, height: 20 }],
                data: { protocol: 'TCP' },
              },
            ],
            children: [
              { id: 'pod', layoutOptions: { 'partitioning.partition': '-800' } },
              { id: 'service', layoutOptions: { 'partitioning.partition': '-500' } },
            ],
          },
        ],
      });

      return {
        ...elkGraph,
        edges: [
          {
            id: 'root-edge',
            sources: ['outside-a'],
            targets: ['outside-b'],
            sections: [{ id: 'root-section' }],
            data: { scope: 'root' },
          },
        ],
        children: [
          {
            ...elkGraph.children[0],
            x: 100,
            y: 50,
            width: 500,
            height: 300,
            edges: [
              {
                ...elkGraph.children[0].edges[0],
                type: 'edge',
                sections: [{ id: 'section-1' }],
              },
            ],
            children: [
              {
                ...elkGraph.children[0].children[0],
                x: 10,
                y: 20,
                width: 220,
                height: 70,
                edges: [
                  {
                    id: 'nested-edge',
                    sources: ['pod'],
                    targets: ['service'],
                  },
                ],
              },
            ],
          },
        ],
      };
    });
    const { applyGraphLayout } = await import('./graphLayout');

    const result = await applyGraphLayout(graph, 1.5);

    expect(mocks.layout).toHaveBeenCalledWith(expect.any(Object), {
      layoutOptions: { 'elk.aspectRatio': '1.5' },
    });
    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: 'group',
        parentId: undefined,
        position: { x: 100, y: 50 },
        style: { width: 500, height: 300 },
      }),
      expect.objectContaining({
        id: 'pod',
        parentId: 'group',
        position: { x: 10, y: 20 },
        data: { kind: 'Pod' },
      }),
    ]);
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: 'root-edge',
        type: 'customEdge',
        data: expect.objectContaining({ parentOffset: { x: 0, y: 0 } }),
      }),
      expect.objectContaining({
        id: 'valid-edge',
        type: 'edge',
        selectable: false,
        focusable: false,
        markerEnd: { type: 'arrowclosed' },
        data: expect.objectContaining({
          label: 'routes',
          sections: [{ id: 'section-1' }],
          parentOffset: { x: 100, y: 50 },
        }),
      }),
      expect.objectContaining({
        id: 'nested-edge',
        type: 'customEdge',
        data: expect.objectContaining({ parentOffset: { x: 110, y: 70 } }),
      }),
    ]);
  });

  it('converts collapsed groups to fixed leaf nodes without children or edges', async () => {
    const graph: GraphNode = {
      id: 'root',
      edges: [],
      nodes: [
        {
          id: 'collapsed-group',
          collapsed: true,
          nodes: [{ id: 'hidden-child' }],
          edges: [{ id: 'hidden-edge', source: 'collapsed-group', target: 'hidden-child' }],
        },
      ],
    };
    mocks.layout.mockImplementation(async elkGraph => {
      expect(elkGraph.children[0]).toEqual({
        id: 'collapsed-group',
        type: 'object',
        data: undefined,
        edges: undefined,
        children: undefined,
        width: 220,
        height: 70,
      });
      return {
        ...elkGraph,
        children: [{ ...elkGraph.children[0], x: 0, y: 0 }],
      };
    });
    const { applyGraphLayout } = await import('./graphLayout');

    const result = await applyGraphLayout(graph, 1);

    expect(result.nodes.map(node => node.id)).toEqual(['collapsed-group']);
    expect(result.edges).toEqual([]);
  });

  it('returns an empty graph when ELK construction fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const constructorError = new Error('worker unavailable');
    mocks.constructorError = constructorError;
    const { applyGraphLayout } = await import('./graphLayout');

    await expect(applyGraphLayout({ id: 'root' }, 1)).resolves.toEqual({ nodes: [], edges: [] });
    expect(mocks.layout).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('Failed to create ELK instance', constructorError);
    consoleError.mockRestore();
  });
});
