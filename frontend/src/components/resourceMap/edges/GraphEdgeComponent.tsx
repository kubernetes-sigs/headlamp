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
import { BaseEdge, EdgeProps } from '@xyflow/react';
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

  return (
    <BaseEdge
      id={props.id}
      path={svgPath}
      style={{
        stroke: alpha(theme.palette.action.active, 0.8),
      }}
    />
  );
});
