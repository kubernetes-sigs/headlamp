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

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ReactElement, useMemo } from 'react';
import { ClusterChooserType } from '../components/cluster/ClusterChooser';
import { useTypedSelector } from './reducers/reducers';

export type FunctionsToOverride = {
  setToken?: (cluster: string, token: string | null) => void;
  getToken?: (cluster: string) => string | undefined;
};

export interface UIPanel {
  /** Unique ID for this panel */
  id: string;
  /** Panel location */
  side: 'top' | 'right' | 'bottom' | 'left';
  /** React component that will be rendered inside the panel */
  component: (props: any) => ReactElement;
}

export interface UIState {
  isVersionDialogOpen: boolean;
  clusterChooserButtonComponent?: ClusterChooserType;
  hideAppBar?: boolean;
  isFullWidth?: boolean;
  functionsToOverride: FunctionsToOverride;
  panels: Array<UIPanel>;
}

export const INITIAL_UI_STATE: UIState = {
  isVersionDialogOpen: false,
  hideAppBar: false,
  isFullWidth: false,
  functionsToOverride: {},
  panels: [],
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState: INITIAL_UI_STATE,
  reducers: {
    setHideAppBar(state, action: PayloadAction<boolean | undefined>) {
      state.hideAppBar = action.payload;
    },
    setClusterChooserButton(state, action: PayloadAction<ClusterChooserType | undefined>) {
      state.clusterChooserButtonComponent = action.payload;
    },
    setVersionDialogOpen(state, action: PayloadAction<boolean>) {
      state.isVersionDialogOpen = action.payload;
    },
    setFunctionsToOverride(state, action: PayloadAction<FunctionsToOverride>) {
      const functionToOverride = action.payload;
      for (const key in functionToOverride) {
        if (functionToOverride.hasOwnProperty(key)) {
          (state.functionsToOverride as Record<string, any>)[key] =
            functionToOverride[key as keyof FunctionsToOverride];
        }
      }
    },
    setIsFullWidth(state, action: PayloadAction<boolean | undefined>) {
      state.isFullWidth = action.payload;
    },
    addUIPanel(state, action: PayloadAction<UIPanel>) {
      const panel = action.payload;

      // Remove existing panel with this id, if it exists
      state.panels = state.panels.filter(it => it.id !== panel.id);
      state.panels.push(panel);
    },
  },
});

/**
 * @returns UI panels grouped by their location
 */
export const useUIPanelsGroupedBySide = () => {
  const panels = useTypedSelector(state => state.ui.panels);

  return useMemo(
    () =>
      panels.reduce((result, panel) => (result[panel.side].push(panel), result), {
        top: [] as UIPanel[],
        right: [] as UIPanel[],
        left: [] as UIPanel[],
        bottom: [] as UIPanel[],
      }),
    [panels]
  );
};
