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

import { getSavedNamespaces } from '../lib/storage';
import filterReducer, {
  FilterState,
  initialState,
  resetFilter,
  setNamespaceFilter,
} from './filterSlice';

// Mock getCluster to ensure a consistent key for localStorage tests
vi.mock('../lib/cluster', () => ({
  getCluster: () => 'test-cluster',
}));

describe('filterSlice', () => {
  let state: FilterState;
  const STORAGE_KEY = 'headlamp-selected-namespace_test-cluster';

  beforeEach(() => {
    state = { ...initialState, namespaces: new Set() };
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should handle setNamespaceFilter and persist to localStorage', () => {
    const namespaces = ['default', 'kube-system'];
    state = filterReducer(state, setNamespaceFilter(namespaces));

    // Verify state update
    expect(state.namespaces).toEqual(new Set(namespaces));

    // Verify localStorage write
    const stored = localStorage.getItem(STORAGE_KEY);
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

  describe('getSavedNamespaces (Persistence Logic)', () => {
    it('should correctly restore per-cluster selections', () => {
      const saved = ['namespace-a', 'namespace-b'];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));

      const restored = getSavedNamespaces('test-cluster');
      expect(restored).toEqual(saved);
    });

    it('should safely handle invalid JSON in storage', () => {
      localStorage.setItem(STORAGE_KEY, '{ invalid json [');

      const restored = getSavedNamespaces('test-cluster');
      expect(restored).toEqual([]);
    });

    it('should safely handle non-array values in storage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));

      const restored = getSavedNamespaces('test-cluster');
      expect(restored).toEqual([]);
    });

    it('should return empty array if no data exists for the cluster', () => {
      const restored = getSavedNamespaces('non-existent-cluster');
      expect(restored).toEqual([]);
    });
  });
});
