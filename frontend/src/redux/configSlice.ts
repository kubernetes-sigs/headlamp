import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Cluster } from '../lib/k8s/cluster';

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
  settings: {
    tableRowsPerPageOptions:
      storedSettings.tableRowsPerPageOptions || defaultTableRowsPerPageOptions,
    timezone: storedSettings.timezone || defaultTimezone(),
    sidebarSortAlphabetically: storedSettings.sidebarSortAlphabetically || false,
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
    setConfig(state, action: PayloadAction<{ clusters: ConfigState['clusters'] }>) {
      state.clusters = action.payload.clusters;
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
