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

export interface DrawerModeState {
  isDetailDrawerEnabled: boolean;
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

const getLocalDrawerStatus = (key: string) => localStorage.getItem(key) === 'true';

const localStorageName = 'detailDrawerEnabled';

const initialState: DrawerModeState = {
  isDetailDrawerEnabled: getLocalDrawerStatus(localStorageName),
  selectedResource: undefined,
};

const drawerModeSlice = createSlice({
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
  },
});

export const { setDetailDrawerEnabled, setSelectedResource } = drawerModeSlice.actions;
export default drawerModeSlice.reducer;
