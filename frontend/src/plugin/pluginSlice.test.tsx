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

import React from 'react';
import {
  PluginInfo,
  PluginSettingsComponentType,
  pluginsSlice,
  PluginsState,
} from './pluginsSlice';

// initial state for the plugins slice
const initialState: PluginsState = {
  /** Once the plugins have been fetched and executed. */
  loaded: false,
  /** If plugin settings are saved use those. */
  pluginSettings: JSON.parse(localStorage.getItem('headlampPluginSettings') || '[]'),
};

// Mock React component for testing
const MockComponent: React.FC = () => <div>New Component</div>;

describe('pluginsSlice reducers', () => {
  const { setPluginSettingsComponent } = pluginsSlice.actions;

  test('should handle setting a new plugin settings component when plugin name matches', () => {
    const existingPluginName = 'test-plugin';
    const initialStateWithPlugin: PluginsState = {
      ...initialState,
      pluginSettings: [
        {
          name: existingPluginName,
          settingsComponent: undefined,
          displaySettingsComponentWithSaveButton: false,
        } as PluginInfo,
      ],
    };

    const action = setPluginSettingsComponent({
      name: existingPluginName,
      component: MockComponent as PluginSettingsComponentType,
      displaySaveButton: true,
    });

    const newState = pluginsSlice.reducer(initialStateWithPlugin, action);

    expect(newState.pluginSettings[0].settingsComponent).toBeDefined();
    expect(newState.pluginSettings[0].displaySettingsComponentWithSaveButton).toBe(true);
  });

  test('should not modify state when plugin name does not match any existing plugin', () => {
    const nonExistingPluginName = 'non-existing-plugin';
    const initialStateWithPlugin: PluginsState = {
      ...initialState,
      pluginSettings: [
        {
          name: 'existing-plugin',
          settingsComponent: undefined,
          displaySettingsComponentWithSaveButton: false,
        } as PluginInfo,
      ],
    };

    const action = setPluginSettingsComponent({
      name: nonExistingPluginName,
      component: MockComponent as PluginSettingsComponentType,
      displaySaveButton: true,
    });

    const newState = pluginsSlice.reducer(initialStateWithPlugin, action);

    expect(newState).toEqual(initialStateWithPlugin);
  });
});
