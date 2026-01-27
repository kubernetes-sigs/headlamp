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
import type { Cluster } from '../lib/k8s/cluster';

export interface ConfigState {
  /**
   * Clusters is a map of cluster names to cluster objects.
   * Null indicates that the clusters have not been loaded yet.
   */
  clusters: {
    [clusterName: string]: Cluster;
  } | null;
  /**
   * Stateless Clusters is a map of cluster names to cluster objects.
   * Null indicates that the clusters have not been loaded yet.
   */
  statelessClusters: {
    [clusterName: string]: Cluster;
  } | null;

  /**
   * All Clusters is a map of cluster names to cluster objects.
   * They are comination of clusters and statelessClusters.
   * Null indicates that the clusters have not been loaded yet.
   */
  allClusters: {
    [clusterName: string]: Cluster;
  } | null;
  /**
   * Whether dynamic clusters are enabled.
   * When true, users can add and delete clusters dynamically.
   */
  isDynamicClusterEnabled: boolean;
  /**
   * Settings is a map of settings names to settings values.
   */
  settings: {
    /**
     * tableRowsPerPageOptions is the list of options for the number of rows per page in a table.
     */
    tableRowsPerPageOptions: number[];
    /**
     * timezone is the timezone to use for displaying dates and times.
     */
    timezone: string;
    useEvict: boolean;
    [key: string]: any;
  };
}

export const defaultTableRowsPerPageOptions = [15, 25, 50];

function defaultTimezone() {
  return import.meta.env.UNDER_TEST ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const storedSettings = JSON.parse(localStorage.getItem('settings') || '{}');

export const initialState: ConfigState = {
  clusters: null,
  statelessClusters: null,
  allClusters: null,
  isDynamicClusterEnabled: false,
  settings: {
    tableRowsPerPageOptions:
      storedSettings.tableRowsPerPageOptions || defaultTableRowsPerPageOptions,
    timezone: storedSettings.timezone || defaultTimezone(),
    sidebarSortAlphabetically: storedSettings.sidebarSortAlphabetically || false,
    useEvict: storedSettings.useEvict || true,
  },
};

const configSlice = createSlice({
  name: 'config',
  initialState,
  reducers: {
    /**
     * Save the config. To both the store, and localStorage.
     * @param state - The current state.
     * @param action - The payload action containing the config.
     */
    setConfig(
      state,
      action: PayloadAction<{
        clusters: ConfigState['clusters'];
        isDynamicClusterEnabled?: boolean;
      }>
    ) {
      state.clusters = action.payload.clusters;
      if (action.payload.isDynamicClusterEnabled !== undefined) {
        state.isDynamicClusterEnabled = action.payload.isDynamicClusterEnabled;
      }
    },
    /**
     * Save the config. To both the store, and localStorage.
     * @param state - The current state.
     * @param action - The payload action containing the config.
     */
    setStatelessConfig(
      state,
      action: PayloadAction<{ statelessClusters: ConfigState['statelessClusters'] }>
    ) {
      state.statelessClusters = action.payload.statelessClusters;
    },
    /**
     * Save the settings. To both the store, and localStorage.
     * @param state - The current state.
     * @param action - The payload action containing the settings.
     */
    setAppSettings(state, action: PayloadAction<Partial<ConfigState['settings']>>) {
      Object.keys(action.payload).forEach(key => {
        state.settings[key] = action.payload[key];
      });
      localStorage.setItem('settings', JSON.stringify(state.settings));
    },
  },
});

export const { setConfig, setAppSettings, setStatelessConfig } = configSlice.actions;

export default configSlice.reducer;
