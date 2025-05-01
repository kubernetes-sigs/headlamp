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

import { useSelector } from 'react-redux';
import store from '../redux/stores/store';
import { setPluginConfig, updatePluginConfig } from './pluginConfigSlice';

/**
 * A class to manage the configuration state for plugins in a Redux store.
 *
 * @template T - The type of the configuration object.
 */
export class ConfigStore<T> {
  private configKey: string;

  /**
   * Creates an instance of the ConfigStore class.
   *
   * @param {string} configKey - The key to identify the specific plugin configuration.
   */
  constructor(configKey: string) {
    this.configKey = configKey;
  }

  /**
   * Sets the entire configuration for a specific plugin.
   *
   * This method will overwrite the entire configuration object for the given key.
   *
   * @param {T} configValue - The new configuration object.
   */
  public set(configValue: T) {
    store.dispatch(
      setPluginConfig({
        configKey: this.configKey,
        payload: configValue as { [key: string]: any },
      })
    );
  }

  /**
   * Updates the configuration for a specific plugin.
   *
   * This method will merge the provided partial updates into the current configuration object.
   *
   * @param {Partial<T>} partialUpdates - An object containing the updates to be merged into the current configuration.
   */
  public update(partialUpdates: Partial<T>) {
    store.dispatch(updatePluginConfig({ configKey: this.configKey, payload: partialUpdates }));
  }

  /**
   * Retrieves the current configuration for the specified key from the Redux store.
   *
   * @returns The current configuration object.
   */
  public get(): T {
    const state: any = store.getState();
    return state?.pluginConfigs?.[this.configKey] as T;
  }

  /**
   * Creates a custom React hook for accessing the plugin's configuration state reactively.
   *
   * This hook allows components to access and react to changes in the plugin's configuration.
   *
   * @returns A custom React hook that returns the configuration state.
   */
  public useConfig() {
    const configKey = this.configKey; // Capture the configKey for closure
    return function useConfigHook(): T {
      return useSelector((state: any) => state?.pluginConfigs?.[configKey] as T);
    };
  }
}
