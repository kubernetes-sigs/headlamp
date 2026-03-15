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

import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

export type DisplayMode = 'normal' | 'disabled' | 'hidden';

export type SettingSource = 'hidden' | 'disabled' | 'user' | 'cluster' | 'default' | 'built-in';

export interface SettingsSource {
  name: string;
  type?: string;
  namespace?: string;
}

export interface AdminSettingsState {
  /** Plain values with $value/$display/$clusterDefined unwrapped. */
  defaults: Record<string, any> | null;
  /** Maps dotted paths to their display mode (only non-normal entries). */
  display: Record<string, DisplayMode>;
  /** Global cluster allow-list and sources config. */
  clusterDefinedSettings: any;
  /** Maps dotted paths to per-setting cluster allow-lists. */
  clusterDefined: Record<string, string[]>;
  /** Resolved sources per cluster (cluster name → list of ConfigMap/Secret sources). */
  sources: Record<string, SettingsSource[]>;
  /** Cluster settings keyed by cluster name, fetched from cluster resources. */
  clusterSettings: Record<string, any>;
}

export const initialAdminSettingsState: AdminSettingsState = {
  defaults: null,
  display: {},
  clusterDefinedSettings: {},
  clusterDefined: {},
  sources: {},
  clusterSettings: {},
};

const adminSettingsSlice = createSlice({
  name: 'adminSettings',
  initialState: initialAdminSettingsState,
  reducers: {
    setAdminSettings(
      state,
      action: PayloadAction<{
        defaults: Record<string, any>;
        display: Record<string, DisplayMode>;
        clusterDefinedSettings: any;
        clusterDefined: Record<string, string[]>;
        sources?: Record<string, SettingsSource[]>;
      }>
    ) {
      state.defaults = action.payload.defaults;
      state.display = action.payload.display;
      state.clusterDefinedSettings = action.payload.clusterDefinedSettings;
      state.clusterDefined = action.payload.clusterDefined;
      state.sources = action.payload.sources ?? {};
    },
    setClusterSettings(state, action: PayloadAction<Record<string, any>>) {
      state.clusterSettings = action.payload;
    },
  },
});

export const { setAdminSettings, setClusterSettings } = adminSettingsSlice.actions;

export default adminSettingsSlice.reducer;
