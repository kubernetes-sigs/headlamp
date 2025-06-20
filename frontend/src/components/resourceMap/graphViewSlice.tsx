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
 * This slice contains custom graph elements and glances registered by plugins
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ReactNode } from 'react';
import { GraphNode, GraphSource } from './graph/graphModel';

export interface IconDefinition {
  /**
   * Icon element
   */
  icon: ReactNode;
  /**
   * Color of the icon
   * @example #FF0000
   * @example rgba(255, 100, 20, 0.5)
   */
  color?: string;
}

/**
 * Represents a glance, a custom UI component for rendering specific graph nodes.
 */
export interface Glance {
  /**
   * A unique identifier for the glance.
   */
  id: string;
  /**
   * A function that returns a React component to render for a given graph node.
   * @param props - Object containing the graph node to be rendered.
   * @param props.node - The graph node to be visualized by the glance.
   * @returns A ReactNode representing the rendered component.
   */
  component: (props: { node: GraphNode }) => ReactNode;
}

export interface GraphViewSliceState {
  graphSources: GraphSource[];
  kindIcons: Record<string, IconDefinition>;
  glances: Record<string, Glance>;
}

const initialState: GraphViewSliceState = {
  graphSources: [],
  kindIcons: {},
  glances: {},
};

export const graphViewSlice = createSlice({
  name: 'graphViewSlice',
  initialState,
  reducers: {
    addGraphSource(state, action: PayloadAction<GraphSource>) {
      if (state.graphSources.find(it => it.id === action.payload?.id) !== undefined) {
        console.error(`Source with id ${action.payload.id} was already registered`);
        return;
      }
      state.graphSources.push(action.payload);
    },
    addKindIcon(state, action: PayloadAction<{ kind: string; definition: IconDefinition }>) {
      state.kindIcons[action.payload.kind] = action.payload.definition;
    },
    setGlance(state, action: PayloadAction<Glance>) {
      state.glances[action.payload.id] = action.payload;
    },
  },
});

export const { addGraphSource, addKindIcon, setGlance } = graphViewSlice.actions;
export default graphViewSlice.reducer;
