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

import { parseAdminSettings } from './parseAdminSettings';

describe('parseAdminSettings', () => {
  it('unwraps a full example with display, clusterDefined, and nested values', () => {
    const raw = {
      clusterDefinedSettings: {},
      defaults: {
        theme: {
          $display: 'disabled',
          $value: { light: 'headlamp-light', dark: 'corporate-dark' },
        },
        timezone: 'UTC',
        tableRowsPerPageOptions: [15, 25, 50],
        useEvict: { $display: 'disabled', $value: true },
        clusters: {
          '*': {
            nodeShellTerminal: {
              linuxImage: { $display: 'disabled', $value: 'busybox:latest' },
            },
          },
          'production-cluster': {
            nodeShellTerminal: {
              isEnabled: { $display: 'disabled', $value: false },
            },
          },
        },
        plugins: {
          'headlamp-ai-assistant': {
            provider: { $display: 'hidden', $value: 'azure-openai' },
            endpoint: { $display: 'hidden', $value: 'https://corp.openai.azure.com' },
          },
          'headlamp-prometheus': {
            address: {
              $clusterDefined: ['*'],
              $value: 'http://localhost:9090',
            },
          },
        },
      },
    };

    const result = parseAdminSettings(raw);

    // Display modes
    expect(result.display['theme']).toBe('disabled');
    expect(result.display['useEvict']).toBe('disabled');
    expect(result.display['clusters.*.nodeShellTerminal.linuxImage']).toBe('disabled');
    expect(result.display['clusters.production-cluster.nodeShellTerminal.isEnabled']).toBe(
      'disabled'
    );
    expect(result.display['plugins.headlamp-ai-assistant.provider']).toBe('hidden');
    expect(result.display['plugins.headlamp-ai-assistant.endpoint']).toBe('hidden');

    // Cluster-defined per-setting overrides
    expect(result.clusterDefined['plugins.headlamp-prometheus.address']).toEqual(['*']);

    // Unwrapped values
    expect(result.defaults.theme).toEqual({ light: 'headlamp-light', dark: 'corporate-dark' });
    expect(result.defaults.timezone).toBe('UTC');
    expect(result.defaults.useEvict).toBe(true);
    expect(result.defaults.tableRowsPerPageOptions).toEqual([15, 25, 50]);

    const plugins = result.defaults.plugins as Record<string, any>;
    expect(plugins['headlamp-ai-assistant'].provider).toBe('azure-openai');
    expect(plugins['headlamp-ai-assistant'].endpoint).toBe('https://corp.openai.azure.com');
    expect(plugins['headlamp-prometheus'].address).toBe('http://localhost:9090');

    const clusters = result.defaults.clusters as Record<string, any>;
    expect(clusters['*'].nodeShellTerminal.linuxImage).toBe('busybox:latest');
    expect(clusters['production-cluster'].nodeShellTerminal.isEnabled).toBe(false);
  });

  it('handles plain values without wrappers', () => {
    const result = parseAdminSettings({
      clusterDefinedSettings: [],
      defaults: { timezone: 'UTC', tableRowsPerPageOptions: [15, 25, 50] },
    });

    expect(result.defaults.timezone).toBe('UTC');
    expect(result.display).toEqual({});
    expect(result.clusterDefined).toEqual({});
  });

  it('omits display:normal from the display map', () => {
    const result = parseAdminSettings({
      defaults: { normalSetting: { $display: 'normal', $value: 'val' } },
    });

    expect(result.display['normalSetting']).toBeUndefined();
    expect(result.defaults.normalSetting).toBe('val');
  });

  it('handles nested wrapped values alongside plain values', () => {
    const result = parseAdminSettings({
      defaults: {
        clusters: {
          '*': {
            nodeShellTerminal: {
              linuxImage: { $display: 'disabled', $value: 'busybox:latest' },
              namespace: 'default',
            },
          },
        },
      },
    });

    expect(result.display['clusters.*.nodeShellTerminal.linuxImage']).toBe('disabled');

    const clusters = result.defaults.clusters as Record<string, any>;
    expect(clusters['*'].nodeShellTerminal.linuxImage).toBe('busybox:latest');
    expect(clusters['*'].nodeShellTerminal.namespace).toBe('default');
  });

  it('does not mutate the input object', () => {
    const raw = {
      defaults: { theme: { $display: 'disabled', $value: { light: 'custom' } } },
    };
    const originalStr = JSON.stringify(raw);

    parseAdminSettings(raw);

    expect(JSON.stringify(raw)).toBe(originalStr);
  });

  describe('clusterDefinedSettings source resolution', () => {
    it('resolves short form to default sources', () => {
      const result = parseAdminSettings({ clusterDefinedSettings: ['*'] });

      expect(result.sources['*']).toEqual([
        { name: 'headlamp-settings', type: 'configmap', namespace: 'headlamp-tools' },
      ]);
    });

    it('resolves short form with named clusters', () => {
      const result = parseAdminSettings({ clusterDefinedSettings: ['prod', 'dev'] });

      expect(result.sources['prod']).toBeDefined();
      expect(result.sources['dev']).toBeDefined();
      expect(result.sources['staging']).toBeUndefined();
    });

    it('resolves long form with custom sources', () => {
      const result = parseAdminSettings({
        clusterDefinedSettings: {
          '*': [{ name: 'headlamp-settings' }, { name: 'headlamp-secrets', type: 'secret' }],
          'prod-cluster': [
            { name: 'headlamp-settings' },
            { name: 'headlamp-prod-secrets', type: 'secret' },
          ],
        },
      });

      expect(result.sources['*']).toEqual([
        { name: 'headlamp-settings', type: 'configmap', namespace: 'headlamp-tools' },
        { name: 'headlamp-secrets', type: 'secret', namespace: 'headlamp-tools' },
      ]);

      expect(result.sources['prod-cluster']).toEqual([
        { name: 'headlamp-settings', type: 'configmap', namespace: 'headlamp-tools' },
        { name: 'headlamp-prod-secrets', type: 'secret', namespace: 'headlamp-tools' },
      ]);
    });

    it('resolves long form with custom namespace', () => {
      const result = parseAdminSettings({
        clusterDefinedSettings: {
          prod: [{ name: 'my-settings', namespace: 'custom-ns' }, { name: 'headlamp-settings' }],
        },
      });

      expect(result.sources['prod']).toEqual([
        { name: 'my-settings', type: 'configmap', namespace: 'custom-ns' },
        { name: 'headlamp-settings', type: 'configmap', namespace: 'headlamp-tools' },
      ]);
    });

    it('returns empty sources for empty clusterDefinedSettings', () => {
      const result = parseAdminSettings({ clusterDefinedSettings: {} });
      expect(result.sources).toEqual({});
    });

    it('returns empty sources for empty array', () => {
      const result = parseAdminSettings({ clusterDefinedSettings: [] });
      expect(result.sources).toEqual({});
    });
  });
});
