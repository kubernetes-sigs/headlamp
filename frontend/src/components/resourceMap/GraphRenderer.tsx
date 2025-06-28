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

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Edge,
  EdgeMouseHandler,
  Node,
  NodeMouseHandler,
  OnMoveStart,
  ReactFlow,
} from '@xyflow/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import Loader from '../common/Loader';
import { GraphEdgeComponent } from './edges/GraphEdgeComponent';
import { maxZoom, minZoom } from './graphConstants';
import { GraphControls } from './GraphControls';
import { KubeObjectNodeComponent } from './nodes/KubeObjectNode';

export const nodeTypes = {
  object: KubeObjectNodeComponent,
};

const edgeTypes = {
  edge: GraphEdgeComponent,
};

export interface GraphRendererProps {
  /** List of nodes to render */
  nodes: Node[];
  /** List of edges to render */
  edges: Edge[];
  /** Callback when a node is clicked */
  onNodeClick?: NodeMouseHandler<Node>;
  /** Callback when an edge is clicked */
  onEdgeClick?: EdgeMouseHandler<Edge>;
  /** Callback when the graph is started to be moved */
  onMoveStart?: OnMoveStart;
  /** Callback when the background is clicked */
  onBackgroundClick?: () => void;
  /** Additional components to render */
  children?: React.ReactNode;
  /** Additional actions for the controls panael */
  controlActions?: React.ReactNode;
  isLoading?: boolean;
}

const emptyArray: any[] = [];

export function GraphRenderer({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
  onMoveStart,
  onBackgroundClick,
  children,
  controlActions,
  isLoading,
}: GraphRendererProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <ReactFlow
      nodes={isLoading ? emptyArray : nodes}
      edges={isLoading ? emptyArray : edges}
      edgeTypes={edgeTypes}
      nodeTypes={nodeTypes}
      nodesFocusable={false}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onMove={onMoveStart}
      onClick={e => {
        if ((e.target as HTMLElement)?.className?.includes?.('react-flow__pane')) {
          onBackgroundClick?.();
        }
      }}
      minZoom={minZoom}
      maxZoom={maxZoom}
      connectionMode={ConnectionMode.Loose}
    >
      <Background variant={BackgroundVariant.Dots} color={theme.palette.divider} size={2} />
      <Controls showInteractive={false} showFitView={false} showZoom={false}>
        <GraphControls>{controlActions}</GraphControls>
      </Controls>
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Loader title="Loading" />
        </Box>
      )}
      {!isLoading && nodes.length === 0 && (
        <Typography
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          {t('No data to be shown. Try to change filters or select a different namespace.')}
        </Typography>
      )}
      {children}
    </ReactFlow>
  );
}
