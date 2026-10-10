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

import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { MiniMap, MiniMapNode, useStore } from '@xyflow/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTypedSelector } from '../../redux/hooks';
import { useLocalStorageState } from '../globalSearch/useLocalStorageState';
import type { GraphNode } from './graph/graphModel';
import { useFullGraphContext } from './graphViewContext';
import { getGraphNodeStatus, KubeObjectStatus } from './nodes/KubeObjectStatus';

/** Minimap panel size, in pixels. */
const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 120;

/**
 * Resolves visual status for a graph node, recursively aggregating
 * child warning/error statuses for group nodes (e.g. namespaces or workloads).
 */
export function getEffectiveGraphNodeStatus(node: GraphNode): KubeObjectStatus {
  let status = getGraphNodeStatus(node);
  if (status === 'error') {
    return 'error';
  }

  if (node.nodes && node.nodes.length > 0) {
    for (const child of node.nodes) {
      const childStatus = getEffectiveGraphNodeStatus(child);
      if (childStatus === 'error') {
        return 'error';
      }
      if (childStatus === 'warning') {
        status = 'warning';
      }
    }
  }

  return status;
}

/**
 * Resolves colors for nodes on the minimap.
 * Expanded group containers are drawn with a highlighted boundary and subtle tint
 * so their boundaries are clear while their child resource nodes remain visible
 * as distinct colored boxes inside them. Unhealthy groups reflect their status
 * on their outer boundary.
 */
export function getMinimapNodeColors(
  graphNode: GraphNode | undefined,
  theme: { palette: Record<string, any> }
): { color: string; strokeColor: string } {
  const isExpandedGroup = Boolean(graphNode?.nodes?.length && !graphNode?.collapsed);
  const status = graphNode ? getEffectiveGraphNodeStatus(graphNode) : 'success';

  if (isExpandedGroup) {
    const isDark = theme.palette.mode === 'dark';
    const strokeColor =
      status !== 'success'
        ? theme.palette[status]?.main ?? theme.palette.warning.main
        : isDark
        ? 'rgba(255, 255, 255, 0.35)'
        : 'rgba(0, 0, 0, 0.25)';

    const color = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)';

    return {
      color,
      strokeColor,
    };
  }

  return {
    color: theme.palette[status]?.main ?? theme.palette.success.main,
    strokeColor: 'transparent',
  };
}

type MiniMapNodeProps = React.ComponentProps<typeof MiniMapNode>;

/**
 * Calculates node bounds on the minimap. Expanded group containers are
 * slightly inset (by default 8px in graph coordinates) to create clear breathing room
 * between adjacent groups so their borders do not touch or collide on the minimap,
 * without needing to modify the main canvas layout or spacing.
 */
export function getMinimapNodeDimensions(
  node: { x: number; y: number; width: number; height: number },
  isExpandedGroup: boolean,
  groupInset = 8
): { x: number; y: number; width: number; height: number } {
  const inset = isExpandedGroup ? groupInset : 0;
  return {
    x: node.x + inset,
    y: node.y + inset,
    width: Math.max(0, node.width - inset * 2),
    height: Math.max(0, node.height - inset * 2),
  };
}

/**
 * Custom minimap node renderer that applies an inset to expanded group boundaries.
 */
export function CustomMiniMapNode(props: MiniMapNodeProps) {
  const { lookup } = useFullGraphContext();
  const graphNode = lookup.getNode(props.id);
  const isExpandedGroup = Boolean(graphNode?.nodes?.length && !graphNode?.collapsed);

  const { x, y, width, height } = getMinimapNodeDimensions(props, isExpandedGroup);

  return <MiniMapNode {...props} x={x} y={y} width={width} height={height} />;
}

/**
 * Scaled-down overview of the graph in the bottom-right corner, with the
 * currently visible area outlined. Reuses React Flow's built-in MiniMap:
 * dragging or scrolling it moves the main viewport. Can be toggled on/off
 * with the control next to the zoom controls (persisted in localStorage).
 */
export function GraphMiniMap() {
  const { t } = useTranslation();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md'));
  const { lookup } = useFullGraphContext();
  const [hidden] = useLocalStorageState('map-minimap-hidden', false);

  const isDetailsDrawerOpen = useTypedSelector(
    state =>
      Boolean(state.drawerMode?.selectedResource) &&
      Boolean(state.drawerMode?.isDetailDrawerEnabled)
  );

  const rightActivityLocation = useTypedSelector(state => {
    const activities = Object.values(state.activity?.activities ?? {});
    const active = activities.filter(a => !a.minimized);
    if (active.some(a => a.location === 'split-right-wide')) {
      return 'split-right-wide';
    }
    if (active.some(a => a.location === 'split-right')) {
      return 'split-right';
    }
    return null;
  });

  let rightOffset: number | string = 16;
  if (!isSmallScreen) {
    if (isDetailsDrawerOpen) {
      rightOffset = 'calc(60vw + 16px)';
    } else if (rightActivityLocation === 'split-right-wide') {
      rightOffset = 'calc(max(50%, 1024px) + 16px)';
    } else if (rightActivityLocation === 'split-right') {
      rightOffset = 'calc(50% + 16px)';
    }
  }

  const hasNodes = useStore(store => store.nodes.length > 0);

  if (hidden || !hasNodes) {
    return null;
  }

  return (
    <MiniMap
      pannable
      zoomable
      ariaLabel={t('Map overview')}
      style={{
        width: MINIMAP_WIDTH,
        height: MINIMAP_HEIGHT,
        right: rightOffset,
        bottom: 16,
        margin: 0,
        transition: 'right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        backgroundColor: theme.palette.background.default,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: '8px',
      }}
      maskColor={
        theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.55)'
      }
      maskStrokeColor={
        theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'
      }
      maskStrokeWidth={1}
      nodeBorderRadius={4}
      nodeComponent={CustomMiniMapNode}
      nodeColor={node => getMinimapNodeColors(lookup.getNode(node.id), theme).color}
      nodeStrokeColor={node => getMinimapNodeColors(lookup.getNode(node.id), theme).strokeColor}
      nodeStrokeWidth={1.5}
    />
  );
}
