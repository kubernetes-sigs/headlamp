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
import { alpha } from '@mui/system/colorManipulator';
import { BaseEdge, EdgeLabelRenderer, EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { GraphEdge } from '../graph/graphModel';

/**
 * An edge between Kube Objects
 */
export const GraphEdgeComponent = memo((props: EdgeProps & { data: GraphEdge['data'] }) => {
  const theme = useTheme();

  const data = props.data;

  const parentOffset = data.parentOffset;

  const dx = parentOffset.x;
  const dy = parentOffset.y;

  const sections = data.sections;

  const { startPoint, endPoint, bendPoints } = sections[0];

  // Generate the path data string
  const svgPath = `M ${startPoint.x + dx},${startPoint.y + dy} C ${bendPoints[0].x + dx},${
    bendPoints[0].y + dy
  } ${bendPoints[1].x + dx},${bendPoints[1].y + dy} ${endPoint.x + dx},${endPoint.y + dy}`;

  // Calculate the midpoint of the cubic bezier curve (at t = 0.5)
  const labelX =
    0.125 * (startPoint.x + dx) +
    0.375 * (bendPoints[0].x + dx) +
    0.375 * (bendPoints[1].x + dx) +
    0.125 * (endPoint.x + dx);
  const labelY =
    0.125 * (startPoint.y + dy) +
    0.375 * (bendPoints[0].y + dy) +
    0.375 * (bendPoints[1].y + dy) +
    0.125 * (endPoint.y + dy);

  const label = data?.label;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={svgPath}
        style={{
          stroke: alpha(theme.palette.action.active, 0.8),
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: theme.palette.background.paper,
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              color: theme.palette.text.secondary,
              border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              pointerEvents: 'none',
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
