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

import { createContext, useContext } from 'react';
import { GraphLookup } from './graph/graphLookup';
import { GraphEdge, GraphNode } from './graph/graphModel';

/**
 * This module exists separately from GraphView.tsx so it can be imported by
 * both GraphView.tsx and the node renderers (KubeObjectNode.tsx, GroupNode.tsx)
 * without creating a circular dependency between them.
 *
 * GraphView.tsx -> GraphRenderer.tsx -> nodes/*.tsx used to import contexts
 * back from GraphView.tsx, which works inside a single bundle but breaks when
 * these modules are re-exported through a separate entry point (e.g. pluginLib),
 * since the circular import ordering guarantee no longer holds across bundles.
 */

interface GraphViewContent {
  setNodeSelection: (nodeId: string) => void;
  nodeSelection?: string;
}
export const GraphViewContext = createContext({} as any);
export const useGraphView = () => useContext<GraphViewContent>(GraphViewContext);

interface FullGraphContent {
  fullGraph: GraphNode;
  visibleGraph: GraphNode;
  lookup: GraphLookup<GraphNode, GraphEdge>;
}
export const FullGraphContext = createContext({} as any);
export const useFullGraphContext = () => useContext<FullGraphContent>(FullGraphContext);

export const useNode = (id: string) => {
  const { lookup } = useFullGraphContext();

  return lookup.getNode(id);
};
