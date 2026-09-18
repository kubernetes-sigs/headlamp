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

/**
 * Public entry point for the resource Map view.
 *
 * These exports are re-exposed to plugins through `pluginLib.ResourceMap`
 * (see frontend/src/plugin/index.ts) so that plugins can embed the Map's
 * graph renderer and icon set on their own pages. See
 * https://github.com/kubernetes-sigs/headlamp/issues/6556
 */

export { GraphView } from './ResourceMapGraphView';
export { MAP_PERFORMANCE_FEATURES_ENABLED } from './config';
export {
  FullGraphContext,
  GraphViewContext,
  useFullGraphContext,
  useGraphView,
  useNode,
} from './graphViewContext';
export { KubeIcon, getKindGroupColor } from './kubeIcon/KubeIcon';
export type {
  GraphEdge,
  GraphNode,
  GraphNodeStatus,
  GraphSource,
  Relation,
} from './graph/graphModel';
export type { GraphFilter } from './graph/graphFiltering';
