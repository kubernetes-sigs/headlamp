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

import { getSavedLabelSelector, getSavedNamespaces } from '../lib/storage';
import filterReducer, {
  FilterState,
  initialState,
  resetFilter,
  setLabelSelectorFilter,
  setNamespaceFilter,
} from './filterSlice';

// Mock getCluster to ensure a consistent key for localStorage tests
vi.mock('../lib/cluster', () => ({
  getCluster: () => 'test-cluster',
}));

describe('filterSlice', () => {
  let state: FilterState;
  const NAMESPACE_STORAGE_KEY = 'headlamp-selected-namespace_test-cluster';
  const LABEL_SELECTOR_STORAGE_KEY = 'headlamp-label-selector_test-cluster';

  beforeEach(() => {
    state = { ...initialState, namespaces: new Set(), labelSelector: '' };
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should handle setNamespaceFilter and persist to localStorage', () => {
    const namespaces = ['default', 'kube-system'];
    state = filterReducer(state, setNamespaceFilter(namespaces));

    // Verify state update
    expect(state.namespaces).toEqual(new Set(namespaces));

    // Verify localStorage write
    const stored = localStorage.getItem(NAMESPACE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(namespaces);
  });

  it('should handle resetFilter and clear namespaces', () => {
    state = {
      ...state,
      namespaces: new Set(['default']),
    };

    state = filterReducer(state, resetFilter());
    expect(state.namespaces).toEqual(new Set());
  });

  it('should handle setLabelSelectorFilter and persist to localStorage', () => {
    const labelSelector = 'app=nginx,env=production';
    state = filterReducer(state, setLabelSelectorFilter(labelSelector));

    // Verify state update
    expect(state.labelSelector).toBe(labelSelector);

    // Verify localStorage write
    const stored = localStorage.getItem(LABEL_SELECTOR_STORAGE_KEY);
    expect(stored).toBe(labelSelector);
  });

  it('should handle resetFilter and clear label selector', () => {
    // First set a label selector
    state = filterReducer(state, setLabelSelectorFilter('app=nginx'));
    expect(state.labelSelector).toBe('app=nginx');

    // Verify it was stored
    let stored = localStorage.getItem(LABEL_SELECTOR_STORAGE_KEY);
    expect(stored).toBe('app=nginx');

    // Now reset
    state = filterReducer(state, resetFilter());
    expect(state.labelSelector).toBe('');

    // Verify localStorage was updated with empty string
    stored = localStorage.getItem(LABEL_SELECTOR_STORAGE_KEY);
    expect(stored !== null ? stored : '').toBe('');
  });

  it('should update label selector without affecting namespaces', () => {
    state = {
      ...state,
      namespaces: new Set(['default']),
    };

    state = filterReducer(state, setLabelSelectorFilter('app=nginx'));

    expect(state.namespaces).toEqual(new Set(['default']));
    expect(state.labelSelector).toBe('app=nginx');
  });

  describe('getSavedNamespaces (Persistence Logic)', () => {
    it('should correctly restore per-cluster selections', () => {
      const saved = ['namespace-a', 'namespace-b'];
      localStorage.setItem(NAMESPACE_STORAGE_KEY, JSON.stringify(saved));

      const restored = getSavedNamespaces('test-cluster');
      expect(restored).toEqual(saved);
    });

    it('should safely handle invalid JSON in storage', () => {
      localStorage.setItem(NAMESPACE_STORAGE_KEY, '{ invalid json [');

      const restored = getSavedNamespaces('test-cluster');
      expect(restored).toEqual([]);
    });

    it('should safely handle non-array values in storage', () => {
      localStorage.setItem(NAMESPACE_STORAGE_KEY, JSON.stringify({ not: 'an array' }));

      const restored = getSavedNamespaces('test-cluster');
      expect(restored).toEqual([]);
    });

    it('should return empty array if no data exists for the cluster', () => {
      const restored = getSavedNamespaces('non-existent-cluster');
      expect(restored).toEqual([]);
    });
  });

  describe('getSavedLabelSelector (Persistence Logic)', () => {
    it('should correctly restore per-cluster label selector', () => {
      const saved = 'app=nginx,env=production';
      localStorage.setItem(LABEL_SELECTOR_STORAGE_KEY, saved);

      const restored = getSavedLabelSelector('test-cluster');
      expect(restored).toBe(saved);
    });

    it('should return empty string if no data exists for the cluster', () => {
      const restored = getSavedLabelSelector('non-existent-cluster');
      expect(restored).toBe('');
    });

    it('should safely handle localStorage errors', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      const restored = getSavedLabelSelector('test-cluster');
      expect(restored).toBe('');
    });
  });
});
