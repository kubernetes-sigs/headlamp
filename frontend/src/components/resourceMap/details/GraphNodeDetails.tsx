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

import { useDeferredValue } from 'react';
import { GraphNode } from '../graph/graphModel';
import { KubeObjectDetails } from './KubeNodeDetails';

export interface GraphNodeDetailsProps {
  /** Node to display */
  node?: GraphNode;
}

/**
 * Side panel display information about a selected Node
 */
export function GraphNodeDetails({ node }: GraphNodeDetailsProps) {
  const deferredNode = useDeferredValue(node);

  const hasContent = node && (node.detailsComponent || node.kubeObject);

  if (!hasContent) return null;

  return <NodeDetailsRenderer node={deferredNode} />;
}

function NodeDetailsRenderer({ node }: { node?: GraphNode }) {
  const hasContent = node && (node.detailsComponent || node.kubeObject);
  if (!hasContent) return null;

  return (
    <>
      {node.detailsComponent && <node.detailsComponent node={node} />}
      {node.kubeObject && (
        <KubeObjectDetails
          resource={node.kubeObject}
          customResourceDefinition={node.customResourceDefinition}
        />
      )}
    </>
  );
}
