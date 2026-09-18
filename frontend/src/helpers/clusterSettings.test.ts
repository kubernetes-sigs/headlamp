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

import {
  ALLOWED_NAMESPACES_SELECTOR_MAX_AGE_MS,
  clearResolvedAllowedNamespaces,
  ClusterSettings,
  getCombinedAllowedNamespaces,
  hasAllowedNamespacesRestriction,
  isResolvedAllowedNamespacesStale,
  loadClusterSettings,
  loadResolvedAllowedNamespaces,
  storeClusterSettings,
  storeResolvedAllowedNamespaces,
} from './clusterSettings';

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

    it('returns empty object and logs console warning when the stored payload is not valid JSON', () => {
      localStorage.setItem('cluster_settings.prod', '{not json');

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = loadClusterSettings('prod');

      expect(result).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it('returns empty object and logs console warning when the stored payload is not an object', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Test null
      localStorage.setItem('cluster_settings.prod', 'null');
      expect(loadClusterSettings('prod')).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      // Test array
      localStorage.setItem('cluster_settings.prod', '[1, 2, 3]');
      expect(loadClusterSettings('prod')).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);

      // Test string
      localStorage.setItem('cluster_settings.prod', '"some string"');
      expect(loadClusterSettings('prod')).toEqual({});
      expect(consoleWarnSpy).toHaveBeenCalledTimes(3);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('resolved allowed namespaces cache', () => {
    it('round-trips the selector, sorted/deduplicated namespaces and a timestamp', () => {
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['b', 'a', 'b']);

      const cache = loadResolvedAllowedNamespaces('prod');
      expect(cache?.selector).toBe('team=frontend');
      expect(cache?.namespaces).toEqual(['a', 'b']);
      expect(typeof cache?.resolvedAt).toBe('number');
    });

    it('returns null when nothing is stored', () => {
      expect(loadResolvedAllowedNamespaces('never-stored')).toBeNull();
    });

    it('returns null and does not throw when the stored payload is malformed', () => {
      localStorage.setItem('cluster_allowed_namespaces_selector_cache.prod', '{not json');
      expect(loadResolvedAllowedNamespaces('prod')).toBeNull();

      localStorage.setItem(
        'cluster_allowed_namespaces_selector_cache.prod',
        JSON.stringify({ selector: 'team=frontend' })
      );
      expect(loadResolvedAllowedNamespaces('prod')).toBeNull();
    });

    it('is a no-op when the cluster name is empty', () => {
      storeResolvedAllowedNamespaces('', 'team=frontend', ['a']);
      expect(localStorage.getItem('cluster_allowed_namespaces_selector_cache.')).toBeNull();
    });

    it('clears the cache', () => {
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['a']);
      clearResolvedAllowedNamespaces('prod');
      expect(loadResolvedAllowedNamespaces('prod')).toBeNull();
    });
  });

  describe('getCombinedAllowedNamespaces', () => {
    it('returns an empty list when nothing is configured', () => {
      expect(getCombinedAllowedNamespaces('prod')).toEqual([]);
    });

    it('returns the manually configured namespaces', () => {
      storeClusterSettings('prod', { allowedNamespaces: ['b', 'a'] });
      expect(getCombinedAllowedNamespaces('prod')).toEqual(['a', 'b']);
    });

    it('includes the resolved namespaces when the cache matches the configured selector', () => {
      storeClusterSettings('prod', { allowedNamespacesSelector: 'team=frontend' });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['b', 'a']);
      expect(getCombinedAllowedNamespaces('prod')).toEqual(['a', 'b']);
    });

    it('merges, deduplicates and sorts the manual and resolved lists', () => {
      storeClusterSettings('prod', {
        allowedNamespaces: ['c', 'a'],
        allowedNamespacesSelector: 'team=frontend',
      });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['b', 'a']);
      expect(getCombinedAllowedNamespaces('prod')).toEqual(['a', 'b', 'c']);
    });

    it('ignores a cache that was resolved for a different selector', () => {
      storeClusterSettings('prod', {
        allowedNamespaces: ['a'],
        allowedNamespacesSelector: 'team=backend',
      });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['x', 'y']);
      expect(getCombinedAllowedNamespaces('prod')).toEqual(['a']);
    });

    it('ignores the cache when no selector is configured', () => {
      storeClusterSettings('prod', { allowedNamespaces: ['a'] });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['x', 'y']);
      expect(getCombinedAllowedNamespaces('prod')).toEqual(['a']);
    });
  });

  describe('hasAllowedNamespacesRestriction', () => {
    it('is false when no allowed namespaces are configured', () => {
      storeClusterSettings('prod', { allowedNamespaces: [] });
      expect(hasAllowedNamespacesRestriction('prod')).toBe(false);
    });

    it('is true when allowed namespaces are configured explicitly', () => {
      storeClusterSettings('prod', { allowedNamespaces: ['team-a'] });
      expect(hasAllowedNamespacesRestriction('prod')).toBe(true);
    });

    it('is true when a selector is configured but resolves to no namespaces', () => {
      storeClusterSettings('prod', { allowedNamespacesSelector: 'team=frontend' });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', []);
      expect(hasAllowedNamespacesRestriction('prod')).toBe(true);
    });
  });

  describe('isResolvedAllowedNamespacesStale', () => {
    it('is false when no selector is configured', () => {
      storeClusterSettings('prod', {});
      expect(isResolvedAllowedNamespacesStale('prod')).toBe(false);
    });

    it('is true when a selector is configured but nothing is cached', () => {
      storeClusterSettings('prod', { allowedNamespacesSelector: 'team=frontend' });
      expect(isResolvedAllowedNamespacesStale('prod')).toBe(true);
    });

    it('is true when the cache was resolved for a different selector', () => {
      storeClusterSettings('prod', { allowedNamespacesSelector: 'team=backend' });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['a']);
      expect(isResolvedAllowedNamespacesStale('prod')).toBe(true);
    });

    it('is false for a fresh, matching cache and true once it is too old', () => {
      storeClusterSettings('prod', { allowedNamespacesSelector: 'team=frontend' });
      storeResolvedAllowedNamespaces('prod', 'team=frontend', ['a']);
      const resolvedAt = loadResolvedAllowedNamespaces('prod')!.resolvedAt;

      expect(isResolvedAllowedNamespacesStale('prod', resolvedAt + 1000)).toBe(false);
      expect(
        isResolvedAllowedNamespacesStale(
          'prod',
          resolvedAt + ALLOWED_NAMESPACES_SELECTOR_MAX_AGE_MS + 1
        )
      ).toBe(true);
    });
  });
});
