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
import { GraphEdge, GraphNode, GraphSource, Relation } from '../graph/graphModel';

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
 * Create an object from any Kube object
 */
export const makeKubeObjectNode = (obj: KubeObject): GraphNode => {
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
    }, [id, data]);

    return null;
  }
);

export default function useThrottledMemo<T>(factory: () => T, deps: any[], throttleMs: number): T {
  const [state, setState] = useState(factory());

  const debouncedSetState = useCallback(throttle(setState, throttleMs), []);

  useEffect(() => {
    debouncedSetState(factory());
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
  const [selectedSources, setSelectedSources] = useState(() => {
    const _selectedSources = new Set<string>();

    const step = (source: GraphSource) => {
      if (source.isEnabledByDefault ?? true) {
        _selectedSources.add(source.id);
        if ('sources' in source) {
          source.sources.forEach(step);
        }
      }
    };
    sources.map(step);
    return _selectedSources;
  });

  const toggleSelection = useCallback(
    (source: GraphSource) => {
      setSelectedSources(selection => {
        const isSelected = (source: GraphSource): boolean =>
          'sources' in source ? source.sources.every(s => isSelected(s)) : selection.has(source.id);

        const deselectAll = (source: GraphSource) => {
          if ('sources' in source) {
            source.sources.forEach(deselectAll);
          } else {
            selection.delete(source.id);
          }
        };

        const selectAll = (source: GraphSource) => {
          if ('sources' in source) {
            source.sources.forEach(s => selectAll(s));
          } else {
            selection.add(source.id);
          }
        };

        if (!('sources' in source)) {
          // not a group, just toggle the selection
          if (selection.has(source.id)) {
            selection.delete(source.id);
          } else {
            selection.add(source.id);
          }
        } else {
          // if all children are selected, deselect them
          if (source.sources.every(isSelected)) {
            source.sources.forEach(deselectAll);
            selection.delete(source.id);
          } else {
            source.sources.forEach(selectAll);
          }
        }
        return new Set(selection);
      });
    },
    [setSelectedSources]
  );

  const onData = useCallback(
    (id: string, data: MaybeNodesAndEdges) => {
      setSourceData(map => new Map(map).set(id, data));
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

      selectedSources.forEach(id => {
        const data = sourceData.get(id);
        if (data?.nodes) {
          nodes = nodes.concat(data.nodes);
          nodesPerSource.set(id, data.nodes);
        }
        if (data?.edges) {
          edges = edges.concat(data.edges);
        }
      });

      // Create edges based on Relations
      enabledRelations.forEach(relation => {
        const fromNodes = nodesPerSource.get(relation.fromSource) ?? [];
        const toNodes = relation.toSource ? nodesPerSource.get(relation.toSource) ?? [] : nodes;

        fromNodes.forEach(from => {
          toNodes.forEach(to => {
            if (relation.predicate(from, to)) {
              edges.push({
                id: from.id + '-' + to.id,
                source: from.id,
                target: to.id,
              });
            }
          });
        });
      });

      const isLoading =
        sourceData.size === 0 ||
        selectedSources?.values()?.some?.(source => sourceData.get(source) === null);

      return {
        nodes,
        edges,
        toggleSelection,
        setSelectedSources,
        selectedSources,
        sourceData,
        isLoading,
      };
    },
    [sources, selectedSources, sourceData, setSelectedSources, relations],
    500
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
