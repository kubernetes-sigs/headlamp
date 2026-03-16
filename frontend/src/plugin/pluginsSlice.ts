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
import React, { ReactElement } from 'react';

/**
 * Props for PluginSettingsDetailsProps component.
 */
export interface PluginSettingsDetailsProps {
  /**
   * Callback function to be triggered when there's a change in data.
   * @param data - The updated data object.
   */
  onDataChange?: (data: { [key: string]: any }) => void;

  /**
   * Data object representing the current state/configuration.
   * readonly - The data object is readonly and cannot be modified.
   */
  readonly data?: { [key: string]: any };
}

/**
 * PluginSettingsComponentType is the type of the component associated with the plugin's settings.
 */
export type PluginSettingsComponentType =
  | React.ComponentType<PluginSettingsDetailsProps>
  | ReactElement
  | null;

/**
 * PluginInfo is the shape of the metadata information for individual plugin objects.
 */
export type PluginInfo = {
  /**
   * The "name" field contains the plugin's name,
   * and must be lowercase and one word, and may contain hyphens and underscores.
   *
   * @see https://docs.npmjs.com/creating-a-package-json-file#required-name-and-version-fields
   */
  name: string;
  /**
   * folderName is the actual folder name on disk (used for deletion).
   * This may differ from the package.json name, especially for scoped packages.
   */
  folderName?: string;
  /**
   * description text of the plugin from npm with same restrictions as package.json description
   * @see https://docs.npmjs.com/cli/v9/configuring-npm/package-json?v=true#description
   */
  description: string;
  /**
   * displayName is the name of the plugin without the author prefix.
   */
  displayName?: string;
  /**
   * origin is the source of the plugin.
   */
  origin?: string;
  /**
   * homepage is the URL link address for the plugin defined from the package.json
   */
  homepage: string;
  /** repository optional field, repository is an object which some plugins nest their URL link within this object. */
  repository?: any;
  /**
   * isEnable is true when the plugin is enabled
   */
  isEnabled?: boolean;

  /**
   * type indicates the source of the plugin: "development", "user", or "shipped"
   */
  type?: 'development' | 'user' | 'shipped';

  /**
   * isLoaded indicates if this plugin version is actually loaded and executed.
   * When multiple versions of the same plugin exist, only the highest priority enabled version is loaded.
   */
  isLoaded?: boolean;

  /**
   * overriddenBy indicates which higher-priority version is loaded instead of this one.
   * Format: "type" (e.g., "development" or "user")
   */
  overriddenBy?: 'development' | 'user' | 'shipped';

  /**
   * isCompatible is true when the plugin is compatible with this version of Headlamp.
   */
  isCompatible?: boolean;

  version?: string; // unused by PluginSettings
  author?: string; // unused by PluginSettings
  /**
   * dependencies is an object of the plugin's dependencies from the package.json
   */
  devDependencies?: {
    [key: string]: string;
  };

  /**
   * Component associated with the plugin's settings.
   */
  settingsComponent?: PluginSettingsComponentType;

  /**
   * If the plugin settings should be displayed with a save button.
   *
   */
  displaySettingsComponentWithSaveButton?: boolean;
};

export interface PluginsState {
  /** Have plugins finished executing? */
  loaded: boolean;
  /** Information stored by settings about plugins. */
  pluginSettings: PluginInfo[];
}
const initialState: PluginsState = {
  /** Once the plugins have been fetched and executed. */
  loaded: false,
  /** If plugin settings are saved use those. */
  pluginSettings: JSON.parse(localStorage.getItem('headlampPluginSettings') || '[]'),
};

export const pluginsSlice = createSlice({
  name: 'plugins',
  initialState,
  reducers: {
    pluginsLoaded(state) {
      state.loaded = true;
    },
    /**
     * Save the plugin settings. To both the store, and localStorage.
     */
    setPluginSettings(state, action: PayloadAction<PluginInfo[]>) {
      state.pluginSettings = action.payload;
      localStorage.setItem('headlampPluginSettings', JSON.stringify(action.payload));
    },
    /** Reloads the browser page */
    reloadPage() {
      window.location.reload();
    },
    /**
     * Set the plugin settings component.
     */
    setPluginSettingsComponent(
      state,
      action: PayloadAction<{
        name: string;
        component: PluginSettingsComponentType;
        displaySaveButton: boolean;
      }>
    ) {
      const { name, component, displaySaveButton } = action.payload;
      state.pluginSettings = state.pluginSettings.map(plugin => {
        if (plugin.name === name) {
          return {
            ...plugin,
            settingsComponent: component,
            displaySettingsComponentWithSaveButton: displaySaveButton,
          };
        }
        return plugin;
      });
    },
  },
});

export const { pluginsLoaded, setPluginSettings, setPluginSettingsComponent, reloadPage } =
  pluginsSlice.actions;

export default pluginsSlice.reducer;
