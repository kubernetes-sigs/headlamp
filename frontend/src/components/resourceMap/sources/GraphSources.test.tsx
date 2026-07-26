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

import { act, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { GraphEdge, GraphNode, GraphSource, Relation } from '../graph/graphModel';
import {
  getFlatSources,
  GraphSourceManager,
  kubeOwnersEdges,
  kubeOwnersEdgesReversed,
  makeKubeObjectNode,
  makeKubeToKubeEdge,
  useSources,
} from './GraphSources';

vi.mock('lodash', () => ({
  throttle: (callback: (...args: any[]) => unknown) => callback,
}));

const object = (uid: string, ownerReferences?: { uid: string }[]) =>
  ({ metadata: { uid, ownerReferences } } as KubeObject);

const source = (
  id: string,
  data: { nodes?: GraphNode[]; edges?: GraphEdge[] } | null,
  options: { enabled?: boolean; hook?: ReturnType<typeof vi.fn> } = {}
): GraphSource => ({
  id,
  label: id.toUpperCase(),
  isEnabledByDefault: options.enabled,
  useData: options.hook ?? vi.fn(() => data),
});

describe('GraphSources helpers', () => {
  it('flattens nested source groups into leaves', () => {
    const first = source('first', null);
    const second = source('second', null);

    expect(
      getFlatSources([
        {
          id: 'outer',
          label: 'Outer',
          sources: [{ id: 'inner', label: 'Inner', sources: [first] }, second],
        },
      ])
    ).toEqual([first, second]);
  });

  it('creates owner, reversed owner, and direct Kubernetes edges', () => {
    const child = object('child', [{ uid: 'owner' }]);
    const owner = object('owner');

    expect(kubeOwnersEdges(child)).toEqual([
      { id: 'child-owner', source: 'child', target: 'owner' },
    ]);
    expect(kubeOwnersEdgesReversed(child)).toEqual([
      {
        id: 'owner-child',
        type: 'kubeRelation',
        source: 'owner',
        target: 'child',
      },
    ]);
    expect(makeKubeToKubeEdge(child, owner)).toEqual({
      id: 'child-owner',
      source: 'child',
      target: 'owner',
    });
    expect(kubeOwnersEdges(owner)).toEqual([]);
    expect(kubeOwnersEdgesReversed(owner)).toEqual([]);
  });

  it('creates built-in and custom-resource nodes', () => {
    const builtIn = object('built-in');

    class CustomObject {
      static customResourceDefinition = {
        getMainAPIGroup: () => ['example.io', 'v1', 'widgets'],
      };

      metadata = { uid: 'custom' };
    }

    expect(makeKubeObjectNode(builtIn)).toEqual({ id: 'built-in', kubeObject: builtIn });
    expect(makeKubeObjectNode(new CustomObject() as unknown as KubeObject)).toEqual({
      id: 'custom',
      kubeObject: expect.any(CustomObject),
      customResourceDefinition: 'widgets.example.io',
    });
  });
});

describe('GraphSourceManager', () => {
  let context: ReturnType<typeof useSources>;

  const Probe = () => {
    const value = useSources();
    useEffect(() => {
      context = value;
    }, [value]);
    return <div>{value.isLoading ? 'loading' : 'ready'}</div>;
  };

  it('loads selected source hooks and combines deduplicated data and relations', async () => {
    const firstHook = vi.fn(() => ({
      nodes: [{ id: 'first-node' }, { id: 'first-node' }],
      edges: [{ id: 'provided', source: 'first-node', target: 'second-node' }],
    }));
    const secondHook = vi.fn(() => ({ nodes: [{ id: 'second-node' }] }));
    const disabledHook = vi.fn(() => ({ nodes: [{ id: 'disabled-node' }] }));
    const relationPredicate = vi.fn(() => true);
    const disabledPredicate = vi.fn(() => true);
    const sources = [
      {
        id: 'group',
        label: 'Group',
        sources: [
          source('first', null, { hook: firstHook }),
          source('second', null, { hook: secondHook }),
        ],
      },
      source('disabled', null, { enabled: false, hook: disabledHook }),
    ];
    const relations: Relation[] = [
      { fromSource: 'first', toSource: 'second', predicate: relationPredicate },
      { fromSource: 'first', toSource: 'disabled', predicate: disabledPredicate },
    ];

    render(
      <GraphSourceManager sources={sources} relations={relations}>
        <Probe />
      </GraphSourceManager>
    );

    await waitFor(() => expect(context.isLoading).toBe(false));
    expect(firstHook).toHaveBeenCalled();
    expect(secondHook).toHaveBeenCalled();
    expect(disabledHook).not.toHaveBeenCalled();
    expect(context.nodes.map(node => node.id)).toEqual(['first-node', 'second-node']);
    expect(context.edges).toEqual([
      { id: 'provided', source: 'first-node', target: 'second-node' },
      { id: 'first-node-second-node', source: 'first-node', target: 'second-node' },
    ]);
    expect(relationPredicate).toHaveBeenCalledTimes(1);
    expect(disabledPredicate).not.toHaveBeenCalled();
  });

  it('keeps loading true for a selected source whose hook returns null', async () => {
    render(
      <GraphSourceManager sources={[source('pending', null)]} relations={[]}>
        <Probe />
      </GraphSourceManager>
    );

    await waitFor(() => expect(context.sourceData?.get('pending')).toBeNull());
    expect(context.isLoading).toBe(true);
    expect(context.nodes).toEqual([]);
    expect(context.edges).toEqual([]);
  });

  it('toggles leaves and recursively selects or deselects groups', async () => {
    const first = source('first', { nodes: [] });
    const second = source('second', { nodes: [] });
    const group: GraphSource = { id: 'group', label: 'Group', sources: [first, second] };

    render(
      <GraphSourceManager sources={[group]} relations={[]}>
        <Probe />
      </GraphSourceManager>
    );

    await waitFor(() => expect(context.isLoading).toBe(false));
    expect(context.selectedSources).toEqual(new Set(['group', 'first', 'second']));

    act(() => context.toggleSelection(first));
    expect(context.selectedSources).toEqual(new Set(['group', 'second']));

    act(() => context.toggleSelection(group));
    expect(context.selectedSources).toEqual(new Set(['group', 'first', 'second']));

    act(() => context.toggleSelection(group));
    expect(context.selectedSources).toEqual(new Set());

    act(() => context.toggleSelection(first));
    expect(context.selectedSources).toEqual(new Set(['first']));

    act(() => context.setSelectedSources(new Set(['second'])));
    expect(context.selectedSources).toEqual(new Set(['second']));
  });

  it('applies relations without a toSource against all selected nodes', async () => {
    const predicate = vi.fn((from, to) => from.id !== to.id);

    render(
      <GraphSourceManager
        sources={[
          source('first', { nodes: [{ id: 'first-node' }] }),
          source('second', { nodes: [{ id: 'second-node' }] }),
        ]}
        relations={[{ fromSource: 'first', predicate }]}
      >
        <Probe />
      </GraphSourceManager>
    );

    await waitFor(() => expect(context.isLoading).toBe(false));
    expect(predicate).toHaveBeenCalledTimes(2);
    expect(context.edges).toEqual([
      { id: 'first-node-second-node', source: 'first-node', target: 'second-node' },
    ]);
  });
});
