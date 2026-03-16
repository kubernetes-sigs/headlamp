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

import { Cluster } from '../lib/k8s/cluster';
import configReducer, {
  ConfigState,
  defaultTableRowsPerPageOptions,
  initialState,
  setAppSettings,
  setConfig,
  setStatelessConfig,
} from './configSlice';

describe('configSlice', () => {
  it('should return the initial state', () => {
    expect(configReducer(undefined, { type: '' })).toEqual(initialState);
  });

  it('should handle setConfig', () => {
    const clusters: ConfigState['clusters'] = {
      'cluster-1': { name: 'cluster-1' } as Cluster,
      'cluster-2': { name: 'cluster-2' } as Cluster,
    };
    const nextState = configReducer(initialState, setConfig({ clusters }));
    expect(nextState.clusters).toEqual(clusters);
  });

  it('should handle setConfig with isDynamicClusterEnabled', () => {
    const clusters: ConfigState['clusters'] = {
      'cluster-1': { name: 'cluster-1' } as Cluster,
    };
    const nextState = configReducer(
      initialState,
      setConfig({ clusters, isDynamicClusterEnabled: true })
    );
    expect(nextState.clusters).toEqual(clusters);
    expect(nextState.isDynamicClusterEnabled).toBe(true);
  });

  it('should preserve isDynamicClusterEnabled when setConfig is called without it', () => {
    let state = configReducer(
      initialState,
      setConfig({ clusters: {}, isDynamicClusterEnabled: true })
    );

    expect(state.isDynamicClusterEnabled).toBe(true);

    const newClusters: ConfigState['clusters'] = {
      'cluster-1': { name: 'cluster-1' } as Cluster,
    };

    state = configReducer(state, setConfig({ clusters: newClusters }));

    expect(state.clusters).toEqual(newClusters);
    expect(state.isDynamicClusterEnabled).toBe(true);
  });

  it('should handle setStatelessConfig', () => {
    const statelessClusters: ConfigState['statelessClusters'] = {
      'stateless-1': { name: 'stateless-1' } as Cluster,
      'stateless-2': { name: 'stateless-2' } as Cluster,
    };
    const nextState = configReducer(initialState, setStatelessConfig({ statelessClusters }));
    expect(nextState.statelessClusters).toEqual(statelessClusters);
  });

  describe('setAppSettings', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should handle setAppSettings and update localStorage', () => {
      const settings: Partial<ConfigState['settings']> = {
        tableRowsPerPageOptions: defaultTableRowsPerPageOptions,
        timezone: 'America/Los_Angeles',
      };
      const nextState = configReducer(initialState, setAppSettings(settings));

      expect(nextState.settings.tableRowsPerPageOptions).toEqual(defaultTableRowsPerPageOptions);
      expect(nextState.settings.timezone).toEqual('America/Los_Angeles');

      const storedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
      expect(storedSettings.tableRowsPerPageOptions).toEqual(defaultTableRowsPerPageOptions);
      expect(storedSettings.timezone).toEqual('America/Los_Angeles');
    });

    it('should handle setAppSettings with only one setting', () => {
      const settings: Partial<ConfigState['settings']> = {
        tableRowsPerPageOptions: defaultTableRowsPerPageOptions,
      };
      const nextState = configReducer(initialState, setAppSettings(settings));

      expect(nextState.settings.tableRowsPerPageOptions).toEqual(defaultTableRowsPerPageOptions);
      expect(nextState.settings.timezone).toEqual(initialState.settings.timezone);

      const storedSettings = JSON.parse(localStorage.getItem('settings') || '{}');
      expect(storedSettings.tableRowsPerPageOptions).toEqual(defaultTableRowsPerPageOptions);
      expect(storedSettings.timezone).toEqual(initialState.settings.timezone);
    });
  });

  it('should not modify the original state', () => {
    const originalState = JSON.parse(JSON.stringify(initialState));
    const clusters: ConfigState['clusters'] = {
      'cluster-1': { name: 'cluster-1' } as Cluster,
    };
    configReducer(originalState, setConfig({ clusters }));
    expect(originalState).toEqual(initialState);
  });
});
