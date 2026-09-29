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

import { getNodesBounds, getViewportForBounds, Node, useReactFlow, useStore } from '@xyflow/react';
import { useCallback, useMemo } from 'react';
import { useLocalStorageState } from '../globalSearch/useLocalStorageState';
import { maxZoom, minZoom, viewportPaddingPx } from './graphConstants';

/**
 * Zoom Mode represents different approaches to viewport calculation
 *
 * - 100% (default)
 *   Will try to fit nodes without exceeding 100% zoom
 *   Often results in content overflowing but keeps text readable
 *
 * - Fit
 *   Will show everything and zoom out as needed
 */
type zoomMode = '100%' | 'fit';

/**
 * Calculate bounds for a newly generated layout before React Flow has added it
 * to its internal node lookup.
 *
 * Layout node positions are relative to their parents. Build the lookup that
 * `getNodesBounds` needs so nested nodes use absolute positions without falling
 * back to stale nodes from the currently rendered graph.
 *
 * @param nodes Newly generated layout nodes, including parent relationships.
 * @returns Bounds containing all layout nodes in absolute graph coordinates.
 */
export function getLayoutNodesBounds(nodes: Node[]) {
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const absolutePositions = new Map<string, { x: number; y: number }>();

  const getAbsolutePosition = (node: Node): { x: number; y: number } => {
    const cachedPosition = absolutePositions.get(node.id);
    if (cachedPosition) return cachedPosition;

    const parent = node.parentId ? nodesById.get(node.parentId) : undefined;
    const parentPosition = parent ? getAbsolutePosition(parent) : { x: 0, y: 0 };
    const position = {
      x: parentPosition.x + node.position.x,
      y: parentPosition.y + node.position.y,
    };
    absolutePositions.set(node.id, position);
    return position;
  };

  const nodeLookup = new Map(
    nodes.map(node => [
      node.id,
      {
        ...node,
        measured: {
          width: node.measured?.width ?? node.width,
          height: node.measured?.height ?? node.height,
        },
        internals: {
          positionAbsolute: getAbsolutePosition(node),
          // Bounds only use geometry; z is required by InternalNode but does not affect the box.
          z: 0,
          userNode: node,
        },
      },
    ])
  );

  return getNodesBounds(nodes, { nodeLookup });
}

/** Helper hook to deal with viewport zooming */
export const useGraphViewport = () => {
  const [zoomMode, setZoomMode] = useLocalStorageState<zoomMode>('map-zoom-mode', '100%');
  const reactFlowWidth = useStore(it => it.width);
  const reactFlowHeight = useStore(it => it.height);
  const aspectRatio = useStore(it => it.width / it.height);
  const flow = useReactFlow();

  const updateViewport = useCallback(
    ({
      nodes,
      mode = zoomMode,
    }: {
      /** List of nodes, if not provided will use current nodes in the graph */
      nodes?: Node[];
      /** Zoom mode. More info in the type definition {@link zoomMode} */
      mode?: zoomMode;
    }) => {
      if (mode !== zoomMode) {
        setZoomMode(() => mode);
      }

      const bounds =
        nodes === undefined ? flow.getNodesBounds(flow.getNodes()) : getLayoutNodesBounds(nodes);

      if (mode === 'fit') {
        const viewport = getViewportForBounds(
          {
            x: bounds.x - viewportPaddingPx,
            y: bounds.y - viewportPaddingPx,
            width: bounds.width + viewportPaddingPx * 2,
            height: bounds.height + viewportPaddingPx * 2,
          },
          reactFlowWidth,
          reactFlowHeight,
          minZoom,
          maxZoom,
          0
        );

        flow.setViewport(viewport);
        return;
      }

      if (mode === '100%') {
        const topLeftOrigin = { x: viewportPaddingPx, y: viewportPaddingPx };
        const centerOrigin = {
          x: reactFlowWidth / 2 - bounds.width / 2,
          y: reactFlowHeight / 2 - bounds.height / 2,
        };

        const xFits = bounds.width + viewportPaddingPx * 2 <= reactFlowWidth;
        const yFits = bounds.height + viewportPaddingPx * 2 <= reactFlowHeight;

        const defaultZoomViewport = {
          x: xFits ? centerOrigin.x : topLeftOrigin.x,
          y: yFits ? centerOrigin.y : topLeftOrigin.y,
          zoom: 1,
        };

        flow.setViewport(defaultZoomViewport);
        return;
      }

      console.error('Unknown zoom mode', mode);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flow, zoomMode, reactFlowWidth, reactFlowHeight]
  );

  return useMemo(() => ({ updateViewport, aspectRatio }), [updateViewport, aspectRatio]);
};
