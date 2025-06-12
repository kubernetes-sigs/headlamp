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

import { useSelector } from 'react-redux';
import { KubeObject } from '../../../lib/k8s/KubeObject';
import { RootState } from '../../../redux/stores/store';
import { GraphNode } from '../graph/graphModel';
import { KubeObjectGlance } from './KubeObjectGlance';

/**
 * Generic glance component for rendering node previews in Headlamp's graph view.
 * Renders KubeObjectGlance for Kubernetes objects or a plugin-provided glance for other nodes.
 */
export const NodeGlance = ({ node }: { node: GraphNode }) => {
  const glances = useSelector((state: RootState) => state.graphView.glances);

  const glanceResults = Object.values(glances).map(glance => {
    const GlanceComponent = glance.component;
    return <GlanceComponent key={glance.id} node={node} />;
  });

  const validGlanceResults = glanceResults.filter(result => result !== null);
  const results = [...validGlanceResults];

  if (node.kubeObject instanceof KubeObject) {
    results.push(<KubeObjectGlance key="kube-object-glance" resource={node.kubeObject} />);
  }

  /**
   * Return null if no components are available to render.
   */
  if (results.length === 0) {
    return null;
  }

  /**
   * Render all components (custom glances and KubeObjectGlance) within a fragment.
   */
  return <>{results}</>;
};
