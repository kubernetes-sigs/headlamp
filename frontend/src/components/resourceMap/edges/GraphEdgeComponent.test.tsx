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

import { createTheme,ThemeProvider } from '@mui/material/styles';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { GraphEdgeComponent } from './GraphEdgeComponent';

const mockTheme = createTheme();

describe('GraphEdgeComponent', () => {
  it('renders a dashed edge for cross-cluster relations', () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ReactFlowProvider>
          <svg>
            <GraphEdgeComponent
              id="test-edge"
              source="a"
              target="b"
              sourceX={0}
              sourceY={0}
              targetX={100}
              targetY={100}
              sourcePosition={'right' as any}
              targetPosition={'left' as any}
              data={{
                data: {
                  isCrossCluster: true,
                },
                sections: [
                  {
                    startPoint: { x: 0, y: 0 },
                    endPoint: { x: 100, y: 100 },
                    bendPoints: [
                      { x: 50, y: 0 },
                      { x: 50, y: 100 },
                    ],
                  },
                ],
                parentOffset: { x: 0, y: 0 },
              }}
            />
          </svg>
        </ReactFlowProvider>
      </ThemeProvider>
    );

    const path = container.querySelector('path');
    expect(path).toHaveStyle('stroke-dasharray: 5,5');
  });

  it('renders a solid edge for same-cluster relations', () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ReactFlowProvider>
          <svg>
            <GraphEdgeComponent
              id="test-edge"
              source="a"
              target="b"
              sourceX={0}
              sourceY={0}
              targetX={100}
              targetY={100}
              sourcePosition={'right' as any}
              targetPosition={'left' as any}
              data={{
                data: {
                  isCrossCluster: false,
                },
                sections: [
                  {
                    startPoint: { x: 0, y: 0 },
                    endPoint: { x: 100, y: 100 },
                    bendPoints: [
                      { x: 50, y: 0 },
                      { x: 50, y: 100 },
                    ],
                  },
                ],
                parentOffset: { x: 0, y: 0 },
              }}
            />
          </svg>
        </ReactFlowProvider>
      </ThemeProvider>
    );

    const path = container.querySelector('path');
    expect(path).toHaveStyle('stroke-dasharray: none');
  });
});
