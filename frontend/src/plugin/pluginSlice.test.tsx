import React from 'react';
import { describe, expect, test } from 'vitest';
import {
  PluginInfo,
  PluginSettingsComponentType,
  pluginsSlice,
  PluginsState,
} from './pluginsSlice';

// Mock React component for testing
const MockComponent: React.FC = () => <div>New Component</div>;

describe('pluginsSlice reducers', () => {
  const { setPluginSettingsComponent } = pluginsSlice.actions;

  test('should handle setting a new plugin settings component when plugin name matches', async () => {
    const existingPluginName = 'test-plugin';
    const initialStateWithPlugin: PluginsState = {
      loaded: true,
      pluginSettings: [
        {
          name: existingPluginName,
          isEnabled: true,
        },
      ],
    };

    const action = setPluginSettingsComponent({
      name: existingPluginName,
      component: MockComponent as PluginSettingsComponentType,
      displaySaveButton: true,
    });

    const newState = await pluginsSlice.reducer(initialStateWithPlugin, action);

    expect((newState.pluginSettings[0] as PluginInfo)?.settingsComponent).toBeDefined();
    expect((newState.pluginSettings[0] as PluginInfo)?.displaySettingsComponentWithSaveButton).toBe(
      true
    );
  });

  test('should not modify state when plugin name does not match any existing plugin', () => {
    const nonExistingPluginName = 'non-existing-plugin';
    const initialStateWithPlugin: PluginsState = {
      loaded: true,
      pluginSettings: [
        {
          name: nonExistingPluginName,
          isEnabled: true,
        },
      ],
    };

    const action = setPluginSettingsComponent({
      name: 'existing-plugin',
      component: MockComponent as PluginSettingsComponentType,
      displaySaveButton: true,
    });

    const newState = pluginsSlice.reducer(initialStateWithPlugin, action);

    expect(newState).toEqual(initialStateWithPlugin);
  });
});
