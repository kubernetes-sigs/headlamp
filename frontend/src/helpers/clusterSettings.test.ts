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

import { ClusterSettings, loadClusterSettings, storeClusterSettings } from './clusterSettings';

describe('clusterSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('storeClusterSettings', () => {
    it('writes the settings under cluster_settings.<name>', () => {
      const settings: ClusterSettings = { defaultNamespace: 'kube-system' };

      storeClusterSettings('prod', settings);

      expect(JSON.parse(localStorage.getItem('cluster_settings.prod') || '{}')).toEqual(settings);
    });

    it('round-trips a full settings object including nested fields', () => {
      const settings: ClusterSettings = {
        defaultNamespace: 'app',
        allowedNamespaces: ['app', 'app-staging'],
        currentName: 'Production',
        nodeShellTerminal: {
          linuxImage: 'alpine:latest',
          namespace: 'kube-system',
          isEnabled: true,
        },
        podDebugTerminal: {
          debugImage: 'busybox:1.36',
          isEnabled: false,
        },
        appearance: {
          accentColor: '#ff0000',
          icon: 'mdi:server',
        },
      };

      storeClusterSettings('prod', settings);

      expect(loadClusterSettings('prod')).toEqual(settings);
    });

    it('overwrites an existing entry for the same cluster name', () => {
      storeClusterSettings('prod', { defaultNamespace: 'old' });
      storeClusterSettings('prod', { defaultNamespace: 'new' });

      expect(loadClusterSettings('prod')).toEqual({ defaultNamespace: 'new' });
    });

    it('keeps settings for other clusters isolated', () => {
      storeClusterSettings('alpha', { defaultNamespace: 'a' });
      storeClusterSettings('beta', { defaultNamespace: 'b' });

      expect(loadClusterSettings('alpha')).toEqual({ defaultNamespace: 'a' });
      expect(loadClusterSettings('beta')).toEqual({ defaultNamespace: 'b' });
    });

    it('is a no-op when clusterName is an empty string', () => {
      storeClusterSettings('', { defaultNamespace: 'app' });

      // No key should have been written for an empty clusterName.
      expect(localStorage.getItem('cluster_settings.')).toBeNull();
    });

    it('persists an empty settings object', () => {
      storeClusterSettings('prod', {});

      expect(localStorage.getItem('cluster_settings.prod')).toBe('{}');
      expect(loadClusterSettings('prod')).toEqual({});
    });
  });

  describe('loadClusterSettings', () => {
    it('returns an empty object when no entry exists', () => {
      expect(loadClusterSettings('never-stored')).toEqual({});
    });

    it('returns an empty object when clusterName is empty', () => {
      // Even if a value happens to live under the bare prefix, an empty name
      // should never read it.
      localStorage.setItem('cluster_settings.', JSON.stringify({ defaultNamespace: 'leak' }));

      expect(loadClusterSettings('')).toEqual({});
    });

    it('returns the parsed object for a stored cluster', () => {
      localStorage.setItem(
        'cluster_settings.prod',
        JSON.stringify({ defaultNamespace: 'kube-system', currentName: 'Prod' })
      );

      expect(loadClusterSettings('prod')).toEqual({
        defaultNamespace: 'kube-system',
        currentName: 'Prod',
      });
    });

    it('namespaces cluster names so two clusters never alias each other', () => {
      storeClusterSettings('prod', { defaultNamespace: 'p' });

      // A cluster name that happens to be a prefix of another stored key.
      expect(loadClusterSettings('pro')).toEqual({});
      expect(loadClusterSettings('prod.extra')).toEqual({});
    });

    // Documents current behaviour: corrupted localStorage payloads surface as
    // a parse error rather than silently falling back to {}. A future change
    // could add defensive recovery; this test should be updated alongside it.
    it('throws when the stored payload is not valid JSON', () => {
      localStorage.setItem('cluster_settings.prod', '{not json');

      expect(() => loadClusterSettings('prod')).toThrow(SyntaxError);
    });
  });
});
