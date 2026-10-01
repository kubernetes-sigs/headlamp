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

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DrawerModeState {
  isDetailDrawerEnabled: boolean;
  detailDrawerWidth?: number;
  selectedResource?: {
    kind: string;
    metadata: { name: string; namespace?: string };
    /**
     * If the selected resource is a custom resource you should provide
     * the name of the custom resource definition
     */
    customResourceDefinition?: string;
    cluster: string;
  };
}

const getLocalDrawerStatus = (key: string) => localStorage.getItem(key) !== 'false';
const getLocalDrawerWidth = (key: string) => {
  const w = localStorage.getItem(key);
  return w ? parseInt(w, 10) : undefined;
};

const localStorageName = 'detailDrawerEnabled';
const localStorageWidthName = 'detailDrawerWidth';

const initialState: DrawerModeState = {
  isDetailDrawerEnabled: getLocalDrawerStatus(localStorageName),
  detailDrawerWidth: getLocalDrawerWidth(localStorageWidthName),
  selectedResource: undefined,
};

export const drawerModeSlice = createSlice({
  name: 'drawerMode',
  initialState,
  reducers: {
    setDetailDrawerEnabled: (state, action: PayloadAction<boolean>) => {
      state.isDetailDrawerEnabled = action.payload;
      localStorage.setItem(localStorageName, `${action.payload}`);
    },
    setSelectedResource: (state, action: PayloadAction<DrawerModeState['selectedResource']>) => {
      state.selectedResource = action.payload;
    },
    setDetailDrawerWidth: (state, action: PayloadAction<number>) => {
      state.detailDrawerWidth = action.payload;
      localStorage.setItem(localStorageWidthName, action.payload.toString());
    },
  },
});

export const { setDetailDrawerEnabled, setSelectedResource, setDetailDrawerWidth } =
  drawerModeSlice.actions;
export default drawerModeSlice.reducer;
