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

import { loadClusterSettings, storeClusterSettings } from './clusterSettings';

describe('clusterSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('storeClusterSettings', () => {
    it('stores cluster settings in localStorage', () => {
      const settings = {
        defaultNamespace: 'default',
        allowedNamespaces: ['default', 'kube-system'],
        currentName: 'Production',
      };

      storeClusterSettings('test-cluster', settings);

      expect(localStorage.getItem('cluster_settings.test-cluster')).toBe(JSON.stringify(settings));
    });

    it('does nothing when clusterName is empty', () => {
      storeClusterSettings('', { defaultNamespace: 'default' });

      expect(localStorage.getItem('cluster_settings.')).toBeNull();
    });
  });

  describe('loadClusterSettings', () => {
    it('returns stored cluster settings', () => {
      const settings = {
        defaultNamespace: 'default',
        allowedNamespaces: ['default', 'kube-system'],
      };
      localStorage.setItem('cluster_settings.test-cluster', JSON.stringify(settings));

      expect(loadClusterSettings('test-cluster')).toEqual(settings);
    });

    it('returns empty settings when no settings exist', () => {
      expect(loadClusterSettings('missing-cluster')).toEqual({});
    });

    it('returns empty settings when clusterName is empty', () => {
      expect(loadClusterSettings('')).toEqual({});
    });

    it('returns empty settings and removes malformed stored settings', () => {
      localStorage.setItem('cluster_settings.test-cluster', '{ invalid json');

      expect(loadClusterSettings('test-cluster')).toEqual({});
      expect(localStorage.getItem('cluster_settings.test-cluster')).toBeNull();
    });
  });
});
