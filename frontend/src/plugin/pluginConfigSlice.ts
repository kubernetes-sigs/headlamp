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
import _ from 'lodash';

/**
 * The state structure for storing plugin configurations.
 * Each plugin configuration is stored under a unique key.
 */
export interface PluginConfigState {
  [configKey: string]: { [key: string]: any };
}

// Key used for local storage to persist plugin configurations.
const PLUGIN_CONFIG_KEY = 'pluginConfigs';

// Initial state is loaded from local storage, or an empty object if nothing is stored.
const initialState: PluginConfigState = JSON.parse(localStorage.getItem(PLUGIN_CONFIG_KEY) || '{}');

const DEBOUNCE_DELAY = 500; // ms

const debouncedSetItemInLocalStorage = _.debounce((key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error('Error occurred while setting item in local storage:', error);
  }
}, DEBOUNCE_DELAY);

/**
 * Slice for handling plugin configurations.
 * Includes reducers to set and update configurations, which are automatically persisted to local storage.
 */
export const pluginConfigSlice = createSlice({
  name: 'pluginConfig',
  initialState,

  reducers: {
    /**
     * Sets the configuration for a specific plugin.
     * This will overwrite the entire configuration for the given key.
     * The updated state is persisted to local storage.
     *
     * @param state - The current state of the plugin configurations.
     * @param action - An action containing the config key and the new configuration object.
     */
    setPluginConfig(
      state,
      action: PayloadAction<{ configKey: string; payload: { [key: string]: any } }>
    ) {
      state[action.payload.configKey] = action.payload.payload;
      debouncedSetItemInLocalStorage(PLUGIN_CONFIG_KEY, JSON.stringify(state));
    },

    /**
     * Updates the configuration for a specific plugin.
     * This will merge the provided updates into the current configuration for the given key.
     * The updated state is persisted to local storage.
     *
     * @param state - The current state of the plugin configurations.
     * @param action - An action containing the config key and the partial updates to be merged.
     */
    updatePluginConfig(
      state,
      action: PayloadAction<{ configKey: string; payload: { [key: string]: any } }>
    ) {
      state[action.payload.configKey] = {
        ...state[action.payload.configKey],
        ...action.payload.payload,
      };
      debouncedSetItemInLocalStorage(PLUGIN_CONFIG_KEY, JSON.stringify(state));
    },
  },
});

export const { setPluginConfig, updatePluginConfig } = pluginConfigSlice.actions;
export default pluginConfigSlice.reducer;
