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
  getSavedLabelSelector,
  getSavedNamespaces,
  saveLabelSelector,
  saveNamespaces,
} from './storage';

// Mock getCluster to ensure consistent keys
vi.mock('./cluster', () => ({
  getCluster: () => 'test-cluster',
}));

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('namespace persistence', () => {
    const STORAGE_KEY = 'headlamp-selected-namespace_test-cluster';

    it('should save namespaces to localStorage', () => {
      const namespaces = ['default', 'kube-system'];
      saveNamespaces(namespaces);

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBe(JSON.stringify(namespaces));
    });

    it('should load saved namespaces from localStorage', () => {
      const namespaces = ['default', 'kube-system'];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(namespaces));

      const loaded = getSavedNamespaces();
      expect(loaded).toEqual(namespaces);
    });

    it('should return empty array when no namespaces saved', () => {
      const loaded = getSavedNamespaces();
      expect(loaded).toEqual([]);
    });

    it('should handle invalid JSON gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'invalid json');

      const loaded = getSavedNamespaces();
      expect(loaded).toEqual([]);
    });

    it('should sanitize namespace values', () => {
      const namespaces = ['  default  ', '', 'kube-system', '  '];
      saveNamespaces(namespaces);

      const loaded = getSavedNamespaces();
      expect(loaded).toEqual(['default', 'kube-system']);
    });

    it('should remove duplicate namespaces', () => {
      const namespaces = ['default', 'default', 'kube-system'];
      saveNamespaces(namespaces);

      const loaded = getSavedNamespaces();
      expect(loaded).toEqual(['default', 'kube-system']);
    });
  });

  describe('label selector persistence', () => {
    const STORAGE_KEY = 'headlamp-label-selector_test-cluster';

    it('should save label selector to localStorage', () => {
      const labelSelector = 'app=nginx,env=production';
      saveLabelSelector(labelSelector);

      const stored = localStorage.getItem(STORAGE_KEY);
      expect(stored).toBe(labelSelector);
    });

    it('should load saved label selector from localStorage', () => {
      const labelSelector = 'app=nginx,env=production';
      localStorage.setItem(STORAGE_KEY, labelSelector);

      const loaded = getSavedLabelSelector();
      expect(loaded).toBe(labelSelector);
    });

    it('should return empty string when no label selector saved', () => {
      const loaded = getSavedLabelSelector();
      expect(loaded).toBe('');
    });

    it('should handle localStorage errors gracefully', () => {
      // Simulate localStorage error
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const loaded = getSavedLabelSelector();
      expect(loaded).toBe('');
    });

    it('should trim whitespace from label selector', () => {
      const labelSelector = '  app=nginx  ';
      saveLabelSelector(labelSelector);

      const loaded = getSavedLabelSelector();
      expect(loaded).toBe('app=nginx');
    });

    it('should save empty string correctly', () => {
      saveLabelSelector('app=nginx');
      saveLabelSelector('');

      const loaded = getSavedLabelSelector();
      expect(loaded).toBe('');
    });

    it('should handle different cluster contexts separately', () => {
      const labelSelector1 = 'app=nginx';
      saveLabelSelector(labelSelector1, 'cluster-1');

      const labelSelector2 = 'app=apache';
      saveLabelSelector(labelSelector2, 'cluster-2');

      const loaded1 = getSavedLabelSelector('cluster-1');
      const loaded2 = getSavedLabelSelector('cluster-2');

      expect(loaded1).toBe(labelSelector1);
      expect(loaded2).toBe(labelSelector2);
    });
  });
});
