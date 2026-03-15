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

import { AdminSettingsState } from '../redux/adminSettingsSlice';
import { getNestedValue, resolveSettingValue } from './settingsResolution';

describe('getNestedValue', () => {
  it('returns value at a simple path', () => {
    expect(getNestedValue({ timezone: 'UTC' }, 'timezone')).toBe('UTC');
  });

  it('returns value at a nested path', () => {
    const obj = { plugins: { myPlugin: { address: 'http://localhost' } } };
    expect(getNestedValue(obj, 'plugins.myPlugin.address')).toBe('http://localhost');
  });

  it('returns undefined for missing path', () => {
    expect(getNestedValue({ a: 1 }, 'b')).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(getNestedValue(null, 'a')).toBeUndefined();
  });
});

describe('resolveSettingValue', () => {
  const makeAdminSettings = (overrides: Partial<AdminSettingsState> = {}): AdminSettingsState => ({
    defaults: {},
    display: {},
    clusterDefinedSettings: {},
    clusterDefined: {},
    sources: {},
    clusterSettings: {},
    ...overrides,
  });

  it('returns user value when no admin settings', () => {
    const result = resolveSettingValue('timezone', 'US/Eastern', 'UTC', null);
    expect(result).toEqual({ value: 'US/Eastern', source: 'user' });
  });

  it('returns built-in default when no admin settings and no user value', () => {
    const result = resolveSettingValue('timezone', undefined, 'UTC', null);
    expect(result).toEqual({ value: 'UTC', source: 'built-in' });
  });

  it('returns user value over admin default for normal settings', () => {
    const admin = makeAdminSettings({ defaults: { timezone: 'America/New_York' } });
    const result = resolveSettingValue('timezone', 'US/Eastern', 'UTC', admin);
    expect(result).toEqual({ value: 'US/Eastern', source: 'user' });
  });

  it('returns admin default when no user value', () => {
    const admin = makeAdminSettings({ defaults: { timezone: 'America/New_York' } });
    const result = resolveSettingValue('timezone', undefined, 'UTC', admin);
    expect(result).toEqual({ value: 'America/New_York', source: 'default' });
  });

  it('ignores user value for disabled settings', () => {
    const admin = makeAdminSettings({
      defaults: { useEvict: true },
      display: { useEvict: 'disabled' },
    });
    const result = resolveSettingValue('useEvict', false, false, admin);
    expect(result).toEqual({ value: true, source: 'disabled' });
  });

  it('ignores user value for hidden settings', () => {
    const admin = makeAdminSettings({
      defaults: { plugins: { myPlugin: { provider: 'azure' } } },
      display: { 'plugins.myPlugin.provider': 'hidden' },
    });
    const result = resolveSettingValue('plugins.myPlugin.provider', 'openai', 'default', admin);
    expect(result).toEqual({ value: 'azure', source: 'hidden' });
  });

  it('returns cluster value for disabled setting with cluster override', () => {
    const admin = makeAdminSettings({
      defaults: { plugins: { prom: { address: 'http://fallback:9090' } } },
      display: { 'plugins.prom.address': 'disabled' },
      clusterDefined: { 'plugins.prom.address': ['*'] },
      clusterSettings: {
        prod: { plugins: { prom: { address: 'http://prometheus.monitoring:9090' } } },
      },
    });
    const result = resolveSettingValue(
      'plugins.prom.address',
      'http://user-set:9090',
      'http://localhost:9090',
      admin,
      'prod'
    );
    expect(result).toEqual({ value: 'http://prometheus.monitoring:9090', source: 'disabled' });
  });

  it('returns cluster value for normal setting when user has no override', () => {
    const admin = makeAdminSettings({
      defaults: { plugins: { prom: { address: 'http://fallback:9090' } } },
      clusterDefined: { 'plugins.prom.address': ['*'] },
      clusterSettings: {
        prod: { plugins: { prom: { address: 'http://prometheus.monitoring:9090' } } },
      },
    });
    const result = resolveSettingValue(
      'plugins.prom.address',
      undefined,
      'http://localhost:9090',
      admin,
      'prod'
    );
    expect(result).toEqual({ value: 'http://prometheus.monitoring:9090', source: 'cluster' });
  });

  it('does not use cluster value when cluster is not in allow-list', () => {
    const admin = makeAdminSettings({
      defaults: { plugins: { prom: { address: 'http://admin:9090' } } },
      clusterDefined: { 'plugins.prom.address': ['staging'] },
      clusterSettings: {
        prod: { plugins: { prom: { address: 'http://prometheus.monitoring:9090' } } },
      },
    });
    const result = resolveSettingValue(
      'plugins.prom.address',
      undefined,
      'http://localhost:9090',
      admin,
      'prod'
    );
    expect(result).toEqual({ value: 'http://admin:9090', source: 'default' });
  });

  it('uses global clusterDefinedSettings when no per-setting override', () => {
    const admin = makeAdminSettings({
      defaults: { timezone: 'UTC' },
      clusterDefinedSettings: ['*'],
      clusterSettings: {
        prod: { timezone: 'America/Chicago' },
      },
    });
    const result = resolveSettingValue('timezone', undefined, 'UTC', admin, 'prod');
    expect(result).toEqual({ value: 'America/Chicago', source: 'cluster' });
  });

  it('uses global clusterDefinedSettings long form', () => {
    const admin = makeAdminSettings({
      defaults: { timezone: 'UTC' },
      clusterDefinedSettings: { '*': [{ name: 'headlamp-settings' }] },
      clusterSettings: {
        prod: { timezone: 'America/Chicago' },
      },
    });
    const result = resolveSettingValue('timezone', undefined, 'UTC', admin, 'prod');
    expect(result).toEqual({ value: 'America/Chicago', source: 'cluster' });
  });
});
