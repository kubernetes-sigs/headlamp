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

import { beforeEach, describe, expect, it } from 'vitest';
import { setPluginConfig } from '../plugin/pluginConfigSlice';
import store from '../redux/stores/store';
import {
  initialAdminSettingsState,
  setAdminSettings,
  setClusterSettings,
} from './adminSettingsSlice';
import { PluginSettingsAPI } from './pluginSettings';

const PLUGIN = 'my-plugin';
const KEY = 'theme';
const PATH = `plugins.${PLUGIN}.${KEY}`;

type AdminPayload = Parameters<typeof setAdminSettings>[0];

function setAdmin(overrides: Partial<AdminPayload> = {}) {
  store.dispatch(
    setAdminSettings({
      defaults: {},
      display: {},
      clusterDefinedSettings: {},
      clusterDefined: {},
      ...overrides,
    })
  );
}

describe('PluginSettingsAPI', () => {
  beforeEach(() => {
    // Put the real store back to a state without any admin or plugin settings.
    store.dispatch(
      setAdminSettings({
        defaults: initialAdminSettingsState.defaults as any,
        display: {},
        clusterDefinedSettings: {},
        clusterDefined: {},
      })
    );
    store.dispatch(setClusterSettings({}));
    store.dispatch(setPluginConfig({ configKey: PLUGIN, payload: {} }));
  });

  describe('get and getSource', () => {
    it('returns undefined with a built-in source when nothing is configured', () => {
      store.dispatch(
        setAdminSettings({
          defaults: null as any,
          display: {},
          clusterDefinedSettings: {},
          clusterDefined: {},
        })
      );

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBeUndefined();
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY)).toBe('built-in');
    });

    it('returns the user value written through the plugin config slice', () => {
      store.dispatch(setPluginConfig({ configKey: PLUGIN, payload: { [KEY]: 'dark' } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBe('dark');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY)).toBe('user');
    });

    it('returns the admin default when the user has not set a value', () => {
      setAdmin({ defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } } });

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBe('light');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY)).toBe('default');
    });

    it('prefers the user value over the admin default', () => {
      setAdmin({ defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } } });
      store.dispatch(setPluginConfig({ configKey: PLUGIN, payload: { [KEY]: 'dark' } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBe('dark');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY)).toBe('user');
    });

    it('ignores the user value when the admin disabled the setting', () => {
      setAdmin({
        defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } },
        display: { [PATH]: 'disabled' },
      });
      store.dispatch(setPluginConfig({ configKey: PLUGIN, payload: { [KEY]: 'dark' } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBe('light');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY)).toBe('disabled');
    });

    it('ignores the user value when the admin hid the setting', () => {
      setAdmin({
        defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } },
        display: { [PATH]: 'hidden' },
      });
      store.dispatch(setPluginConfig({ configKey: PLUGIN, payload: { [KEY]: 'dark' } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBe('light');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY)).toBe('hidden');
    });

    it('uses the cluster value for an allowed cluster, over the admin default', () => {
      setAdmin({
        defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } },
        clusterDefinedSettings: ['prod'],
      });
      store.dispatch(setClusterSettings({ prod: { plugins: { [PLUGIN]: { [KEY]: 'blue' } } } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY, 'prod')).toBe('blue');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY, 'prod')).toBe('cluster');
    });

    it('falls back to the admin default when the cluster is not allowed to define it', () => {
      setAdmin({
        defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } },
        clusterDefinedSettings: ['prod'],
      });
      store.dispatch(setClusterSettings({ dev: { plugins: { [PLUGIN]: { [KEY]: 'blue' } } } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY, 'dev')).toBe('light');
      expect(PluginSettingsAPI.getSource(PLUGIN, KEY, 'dev')).toBe('default');
    });

    it('does not use cluster values when no cluster name is passed', () => {
      setAdmin({
        defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } },
        clusterDefinedSettings: ['*'],
      });
      store.dispatch(setClusterSettings({ prod: { plugins: { [PLUGIN]: { [KEY]: 'blue' } } } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBe('light');
    });

    it('does not mix up settings of different plugins', () => {
      store.dispatch(setPluginConfig({ configKey: 'other-plugin', payload: { [KEY]: 'other' } }));

      expect(PluginSettingsAPI.get(PLUGIN, KEY)).toBeUndefined();
      expect(PluginSettingsAPI.get('other-plugin', KEY)).toBe('other');
    });
  });

  describe('isHidden and isDisabled', () => {
    it('are false when the setting has no display mode', () => {
      expect(PluginSettingsAPI.isHidden(PLUGIN, KEY)).toBe(false);
      expect(PluginSettingsAPI.isDisabled(PLUGIN, KEY)).toBe(false);
    });

    it('report a hidden setting as hidden but not disabled', () => {
      setAdmin({ display: { [PATH]: 'hidden' } });

      expect(PluginSettingsAPI.isHidden(PLUGIN, KEY)).toBe(true);
      expect(PluginSettingsAPI.isDisabled(PLUGIN, KEY)).toBe(false);
    });

    it('report a disabled setting as disabled but not hidden', () => {
      setAdmin({ display: { [PATH]: 'disabled' } });

      expect(PluginSettingsAPI.isHidden(PLUGIN, KEY)).toBe(false);
      expect(PluginSettingsAPI.isDisabled(PLUGIN, KEY)).toBe(true);
    });

    it('only apply to the setting the display mode was set for', () => {
      setAdmin({ display: { [PATH]: 'hidden' } });

      expect(PluginSettingsAPI.isHidden(PLUGIN, 'other-key')).toBe(false);
      expect(PluginSettingsAPI.isHidden('other-plugin', KEY)).toBe(false);
    });
  });

  describe('getAdminDefault', () => {
    it('returns undefined when there are no admin defaults', () => {
      store.dispatch(
        setAdminSettings({
          defaults: null as any,
          display: {},
          clusterDefinedSettings: {},
          clusterDefined: {},
        })
      );

      expect(PluginSettingsAPI.getAdminDefault(PLUGIN, KEY)).toBeUndefined();
    });

    it('returns the admin default for the plugin setting', () => {
      setAdmin({ defaults: { plugins: { [PLUGIN]: { [KEY]: 'light', count: 0 } } } });

      expect(PluginSettingsAPI.getAdminDefault(PLUGIN, KEY)).toBe('light');
      expect(PluginSettingsAPI.getAdminDefault(PLUGIN, 'count')).toBe(0);
    });

    it('returns undefined for a setting without a default', () => {
      setAdmin({ defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } } });

      expect(PluginSettingsAPI.getAdminDefault(PLUGIN, 'missing')).toBeUndefined();
      expect(PluginSettingsAPI.getAdminDefault('unknown-plugin', KEY)).toBeUndefined();
    });

    it('ignores the user value', () => {
      setAdmin({ defaults: { plugins: { [PLUGIN]: { [KEY]: 'light' } } } });
      store.dispatch(setPluginConfig({ configKey: PLUGIN, payload: { [KEY]: 'dark' } }));

      expect(PluginSettingsAPI.getAdminDefault(PLUGIN, KEY)).toBe('light');
    });
  });

  describe('getClusterSetting', () => {
    it('returns undefined when the cluster has no fetched settings', () => {
      expect(PluginSettingsAPI.getClusterSetting(PLUGIN, KEY, 'prod')).toBeUndefined();
    });

    it('returns the value fetched for the cluster', () => {
      store.dispatch(setClusterSettings({ prod: { plugins: { [PLUGIN]: { [KEY]: 'blue' } } } }));

      expect(PluginSettingsAPI.getClusterSetting(PLUGIN, KEY, 'prod')).toBe('blue');
    });

    it('returns undefined for a missing key or a different cluster', () => {
      store.dispatch(setClusterSettings({ prod: { plugins: { [PLUGIN]: { [KEY]: 'blue' } } } }));

      expect(PluginSettingsAPI.getClusterSetting(PLUGIN, 'missing', 'prod')).toBeUndefined();
      expect(PluginSettingsAPI.getClusterSetting(PLUGIN, KEY, 'dev')).toBeUndefined();
    });

    it('returns the value even when the admin did not allow the cluster to define it', () => {
      setAdmin({ clusterDefinedSettings: [] });
      store.dispatch(setClusterSettings({ prod: { plugins: { [PLUGIN]: { [KEY]: 'blue' } } } }));

      expect(PluginSettingsAPI.getClusterSetting(PLUGIN, KEY, 'prod')).toBe('blue');
      expect(PluginSettingsAPI.get(PLUGIN, KEY, 'prod')).toBeUndefined();
    });
  });
});
