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

import { throttle } from 'lodash';
import {
  createContext,
  memo,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { KubeObject } from '../../../lib/k8s/cluster';
import { resolveCRDApiGroup } from '../../../lib/k8s/crdSpec';
import {
  deduplicateGraphEdges,
  deduplicateGraphElements,
  GraphEdge,
  GraphNode,
  GraphSource,
  Relation,
} from '../graph/graphModel';

/**
 * Map of nodes and edges where the key is source id
 */
export type SourceData = Map<string, MaybeNodesAndEdges>;

type MaybeNodesAndEdges = {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
} | null;

interface GraphSourcesContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
  toggleSelection: (source: GraphSource) => void;
  setSelectedSources: (sources: Set<string>) => void;
  selectedSources: Set<string>;
  sourceData?: SourceData;
  isLoading?: boolean;
}

const Context = createContext<GraphSourcesContext>(undefined as any);

export const useSources = () => useContext(Context);

/**
 * Returns a flat list of all the sources
 */
export function getFlatSources(sources: GraphSource[], result: GraphSource[] = []): GraphSource[] {
  for (const source of sources) {
    if ('sources' in source) {
      getFlatSources(source.sources, result);
    } else {
      result.push(source);
    }
  }
  return result;
}

/**
 * Create Edges from object's ownerReferences
 */
export const kubeOwnersEdges = (obj: KubeObject): GraphEdge[] => {
  return (
    obj.metadata.ownerReferences?.map(owner => ({
      id: `${obj.metadata.uid}-${owner.uid}`,
      source: obj.metadata.uid,
      target: owner.uid,
    })) ?? []
  );
};

/**
 * Create reverse Edges from object's ownerReferences
 */
export const kubeOwnersEdgesReversed = (obj: KubeObject): GraphEdge[] => {
  return (
    obj.metadata.ownerReferences?.map(owner => ({
      id: `${owner.uid}-${obj.metadata.uid}`,
      type: 'kubeRelation',
      source: owner.uid,
      target: obj.metadata.uid,
    })) ?? []
  );
};

/**
 * Create an object from any Kube object
 */
export const makeKubeObjectNode = (obj: KubeObject): GraphNode => {
  const apiGroup = resolveCRDApiGroup((obj.constructor as any)?.customResourceDefinition);
  if (apiGroup) {
    const [group, , plural] = apiGroup;
    return {
      id: obj.metadata.uid,
      kubeObject: obj,
      customResourceDefinition: plural + '.' + group,
    };
  }

  return {
    id: obj.metadata.uid,
    kubeObject: obj,
  };
};

/**
 * Make an edge connecting two Kube objects
 */
export const makeKubeToKubeEdge = (from: KubeObject, to: KubeObject): GraphEdge => ({
  id: `${from.metadata.uid}-${to.metadata.uid}`,
  source: from.metadata.uid,
  target: to.metadata.uid,
});

/**
 * How long a single source is given to resolve before it's treated as
 * empty. Without this, a source whose watch/list never settles (e.g. an
 * API group that hangs or a CRD that never syncs) leaves its entry in
 * sourceData as `null` forever, which keeps the whole Map view's
 * aggregate isLoading stuck at true (see GraphSourceManager.isLoading),
 * even though every other source finished loading.
 */
export const SOURCE_LOADING_TIMEOUT_MS = 15000;

/**
 * Since we can't use hooks in a loop, we need to create a component for each source
 * that will load the data and pass it to the parent component.
 */
const SourceLoader = memo(
  ({
    useHook,
    onData,
    id,
  }: {
    useHook: () => MaybeNodesAndEdges;
    onData: (id: string, data: MaybeNodesAndEdges) => void;
    id: string;
  }) => {
    const data = useHook();

    useEffect(() => {
      onData(id, data);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, data]);

    // Give this source a bounded amount of time to resolve. If it's still
    // null when the timeout fires, treat it as loaded-but-empty so that a
    // single hung source can't block the rest of the Map view from
    // rendering forever. If real data arrives later, the effect above
    // will still update it normally.
    useEffect(() => {
      if (data !== null) {
        return;
      }

      const timeout = setTimeout(() => {
        onData(id, { nodes: [], edges: [] });
      }, SOURCE_LOADING_TIMEOUT_MS);

      return () => clearTimeout(timeout);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, data]);

    return null;
  }
);

export default function useThrottledMemo<T>(factory: () => T, deps: any[], throttleMs: number): T {
  const [state, setState] = useState(factory);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetState = useCallback(throttle(setState, throttleMs), []);

  useEffect(() => {
    debouncedSetState(factory());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export interface GraphSourceManagerProps {
  /** List of sources to load */
  sources: GraphSource[];
  /** Children to render */
  children: ReactNode;
  /** Relations between nodes */
  relations: Relation[];
}

/**
 * Loads data from all the sources
 */
export function GraphSourceManager({ sources, children, relations }: GraphSourceManagerProps) {
  const [sourceData, setSourceData] = useState(new Map<string, MaybeNodesAndEdges>());
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('headlamp_resource_map_source_overrides');
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const valid: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'boolean') {
              valid[k] = v;
            }
          }
          return valid;
        }
      }
    } catch (e) {
      console.error('Error loading map source overrides from localStorage:', e);
    }
    return {};
  });

  const [selectedSources, setSelectedSources] = useState(() => {
    const _selectedSources = new Set<string>();
    const step = (source: GraphSource, parentEnabled: boolean) => {
      const isExplicitlyOverridden = typeof overrides[source.id] === 'boolean';
      const isEnabled = isExplicitlyOverridden
        ? overrides[source.id]
        : (source.isEnabledByDefault ?? parentEnabled);

      if (isEnabled) {
        _selectedSources.add(source.id);
      }
      if ('sources' in source) {
        source.sources.forEach(child => step(child, isEnabled));
      }
    };
    sources.forEach(source => step(source, true));
    return _selectedSources;
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        'headlamp_resource_map_source_overrides',
        JSON.stringify(overrides)
      );
    } catch (e) {
      console.error('Error saving map source overrides to localStorage:', e);
    }
  }, [overrides]);

  const toggleSelection = useCallback(
    (source: GraphSource) => {
      const changes: Record<string, boolean> = {};

      setSelectedSources(selection => {
        const isSelected = (s: GraphSource): boolean =>
          'sources' in s ? s.sources.every(child => isSelected(child)) : selection.has(s.id);

        const deselectAll = (s: GraphSource) => {
          selection.delete(s.id);
          changes[s.id] = false;
          if ('sources' in s) {
            s.sources.forEach(deselectAll);
          }
        };

        const selectAll = (s: GraphSource) => {
          selection.add(s.id);
          changes[s.id] = true;
          if ('sources' in s) {
            s.sources.forEach(child => selectAll(child));
          }
        };

        if (!('sources' in source)) {
          if (selection.has(source.id)) {
            selection.delete(source.id);
            changes[source.id] = false;
          } else {
            selection.add(source.id);
            changes[source.id] = true;
          }
        } else {
          if (source.sources.every(isSelected)) {
            source.sources.forEach(deselectAll);
            selection.delete(source.id);
            changes[source.id] = false;
          } else {
            source.sources.forEach(selectAll);
            selection.add(source.id);
            changes[source.id] = true;
          }
        }

        return new Set(selection);
      });

      setOverrides(prev => ({ ...prev, ...changes }));
    },
    [setSelectedSources, setOverrides]
  );

  const onData = useCallback(
    (id: string, data: MaybeNodesAndEdges) => {
      setSourceData(map => {
        // Skip update if the data reference hasn't changed, avoiding a new Map
        // allocation that would trigger downstream useMemo recomputations.
        if (map.get(id) === data) return map;
        return new Map(map).set(id, data);
      });
    },
    [setSourceData]
  );

  const components = useMemo(() => {
    const allSources = getFlatSources(sources);

    return allSources
      .filter(it => selectedSources.has(it.id))
      .filter(it => 'useData' in it)
      .map(source => {
        return {
          props: {
            useHook: source.useData,
            onData: onData,
            key: source.id,
            id: source.id,
          },
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, selectedSources]);

  const contextValue = useThrottledMemo(
    () => {
      let nodes: GraphNode[] = [];
      let edges: GraphEdge[] = [];

      const enabledRelations = relations.filter(relation => {
        if (relation.toSource) {
          return selectedSources.has(relation.fromSource) && selectedSources.has(relation.toSource);
        }
        return selectedSources.has(relation.fromSource);
      });

      const nodesPerSource = new Map<string, GraphNode[]>();
      const selectedSourceIds = getFlatSources(sources)
        .filter(source => selectedSources.has(source.id))
        .map(source => source.id);

      selectedSourceIds.forEach(id => {
        const data = sourceData.get(id);

        const sourceGraph = deduplicateGraphElements(data?.nodes ?? [], data?.edges ?? []);

        if (data?.nodes) {
          nodes = nodes.concat(sourceGraph.nodes);
          nodesPerSource.set(id, sourceGraph.nodes);
        }
        if (data?.edges) {
          edges = edges.concat(sourceGraph.edges);
        }
      });

      const sourceGraph = deduplicateGraphElements(nodes, edges);
      nodes = sourceGraph.nodes;
      edges = sourceGraph.edges;

      // Build a UID → node index once, shared by all relations that provide
      // buildEdgesWithIndex. This avoids the O(fromNodes × allNodes) nested-loop
      // predicate scan for owner-reference relations, reducing them to
      // O(fromNodes × avgOwnerRefs) with O(1) Map lookups.
      let nodesByUid: Map<string, GraphNode> | null = null;
      const getNodesByUid = () => {
        if (!nodesByUid) {
          nodesByUid = new Map();
          for (const node of nodes) {
            const uid = node.kubeObject?.metadata?.uid;
            if (uid) {
              nodesByUid.set(uid, node);
            }
          }
        }
        return nodesByUid;
      };

      // Create edges based on Relations
      enabledRelations.forEach(relation => {
        const fromNodes = nodesPerSource.get(relation.fromSource) ?? [];

        // Use index-based edge builder when available (O(n) vs O(n²))
        if (relation.buildEdgesWithIndex) {
          const indexEdges = relation.buildEdgesWithIndex(fromNodes, getNodesByUid());
          for (const edge of indexEdges) {
            edges.push(edge);
          }
          return;
        }

        const toNodes = relation.toSource ? nodesPerSource.get(relation.toSource) ?? [] : nodes;

        fromNodes.forEach(from => {
          toNodes.forEach(to => {
            if (relation.predicate(from, to)) {
              edges.push({
                label: relation.label,
                ...relation.edgeAttributes?.(from, to),
                // Structural fields are authoritative and must win over a relation's
                // edgeAttributes: otherwise a Partial<GraphEdge> that (accidentally or
                // not) sets id/source/target could corrupt deduplication or topology.
                id: from.id + '-' + to.id + '-' + relation.id,
                source: from.id,
                target: to.id,
              });
            }
          });
        });
      });

      const isLoading =
        selectedSourceIds.length > 0 &&
        (sourceData.size === 0 ||
          selectedSourceIds.some(
            source => !sourceData.has(source) || sourceData.get(source) === null
          ));

      return {
        nodes,
        edges: deduplicateGraphEdges(edges),
        toggleSelection,
        setSelectedSources,
        selectedSources,
        sourceData,
        isLoading,
      };
    },
    [sources, selectedSources, sourceData, setSelectedSources, relations],
    1000
  );

  return (
    <>
      {components.map(it => (
        <SourceLoader {...it.props} key={it.props.key} />
      ))}
      <Context.Provider value={contextValue}>{children}</Context.Provider>
    </>
  );
}
