/*
 * Copyright 2026 The Kubernetes Authors
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

/**
 * UI display mode for a setting.
 * - `normal`: editable by users.
 * - `disabled`: shown but not editable; the user value is ignored.
 * - `hidden`: not shown in the UI; the user value is ignored.
 *
 * `hidden` and `disabled` are UI-level only and do not imply
 * confidentiality. Cluster-defined settings backed by ConfigMaps or
 * Secrets are fetched from the cluster using the user's own credentials,
 * so access control comes from Kubernetes RBAC, not from this mode.
 */
export type DisplayMode = 'normal' | 'disabled' | 'hidden';

/**
 * Where a resolved setting value came from, in resolution order.
 * `hidden` and `disabled` mean the admin value was forced because of the
 * setting's {@link DisplayMode}; `user`, `cluster`, `default` and `built-in`
 * are the normal-mode precedence chain, highest first.
 */
export type SettingSource = 'hidden' | 'disabled' | 'user' | 'cluster' | 'default' | 'built-in';

/** A cluster resource (ConfigMap or Secret) that cluster-defined settings are read from. */
export interface SettingsSource {
  /** Resource name. */
  name: string;
  /** Resource kind, `ConfigMap` (the default) or `Secret`. */
  type?: string;
  /** Namespace holding the resource. */
  namespace?: string;
}

/**
 * Admin-provided settings, as served by the backend `--settings` file and
 * augmented with what has been fetched from the clusters themselves.
 *
 * The raw settings file is parsed by `parseAdminSettings` into this shape, and
 * `resolveSettingValue` reads it to resolve an individual setting.
 */
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

/** State used until the backend config (and so the admin settings) has been loaded. */
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
    /**
     * Stores the admin settings parsed out of the backend config. Replaces any
     * previously stored ones, but leaves `clusterSettings` alone as those are
     * fetched separately, per cluster.
     */
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
    /**
     * Stores the settings fetched from the clusters' own ConfigMaps/Secrets,
     * keyed by cluster name. The payload is the full map, so clusters missing
     * from it lose their previously fetched settings.
     */
    setClusterSettings(state, action: PayloadAction<Record<string, any>>) {
      state.clusterSettings = action.payload;
    },
  },
});

export const { setAdminSettings, setClusterSettings } = adminSettingsSlice.actions;

/** Reducer for the `adminSettings` slice of the store. */

export default adminSettingsSlice.reducer;
