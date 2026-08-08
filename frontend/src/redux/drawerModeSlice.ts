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

/**
 * Where the resource details drawer snaps within the main content area.
 * The chosen value is persisted to `localStorage['detailDrawerSide']`.
 */
export type DetailDrawerSide = 'left' | 'right' | 'bottom';

/** All valid values of {@link DetailDrawerSide}, in the order shown in Settings. */
export const DETAIL_DRAWER_SIDES: readonly DetailDrawerSide[] = ['left', 'right', 'bottom'];

export interface DrawerModeState {
  isDetailDrawerEnabled: boolean;
  detailDrawerSide: DetailDrawerSide;
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

const localStorageEnabledKey = 'detailDrawerEnabled';
const localStorageSideKey = 'detailDrawerSide';

// localStorage can throw at module load in privacy modes, when the origin has
// no storage access, or when the browser quota is exceeded. Wrap every access
// so a broken storage backend cannot crash the Redux store bootstrap or a
// later dispatch.
function safeReadStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore: storage unavailable or full; state stays in memory only */
  }
}

const getLocalDrawerStatus = (key: string) => safeReadStorage(key) !== 'false';

const getLocalDrawerSide = (key: string): DetailDrawerSide => {
  const stored = safeReadStorage(key);
  return (DETAIL_DRAWER_SIDES as readonly string[]).includes(stored ?? '')
    ? (stored as DetailDrawerSide)
    : 'right';
};

const initialState: DrawerModeState = {
  isDetailDrawerEnabled: getLocalDrawerStatus(localStorageEnabledKey),
  detailDrawerSide: getLocalDrawerSide(localStorageSideKey),
  selectedResource: undefined,
};

export const drawerModeSlice = createSlice({
  name: 'drawerMode',
  initialState,
  reducers: {
    setDetailDrawerEnabled: (state, action: PayloadAction<boolean>) => {
      state.isDetailDrawerEnabled = action.payload;
      safeWriteStorage(localStorageEnabledKey, `${action.payload}`);
    },
    /**
     * Set which edge the resource details drawer snaps to, and persist the
     * choice for future sessions.
     */
    setDetailDrawerSide: (state, action: PayloadAction<DetailDrawerSide>) => {
      state.detailDrawerSide = action.payload;
      safeWriteStorage(localStorageSideKey, action.payload);
    },
    setSelectedResource: (state, action: PayloadAction<DrawerModeState['selectedResource']>) => {
      state.selectedResource = action.payload;
    },
  },
});

export const { setDetailDrawerEnabled, setDetailDrawerSide, setSelectedResource } =
  drawerModeSlice.actions;
export default drawerModeSlice.reducer;
