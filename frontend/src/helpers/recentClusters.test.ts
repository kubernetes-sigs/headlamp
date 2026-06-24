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
import { getRecentClusters, setRecentCluster } from './recentClusters';

const STORAGE_KEY = 'recent_clusters';

function read(): unknown {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

describe('recentClusters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('setRecentCluster', () => {
    it('writes a single cluster name when localStorage is empty', () => {
      setRecentCluster('alpha');

      expect(read()).toEqual(['alpha']);
    });

    it('accepts a Cluster object and stores the cluster.name field', () => {
      const cluster = { name: 'beta' } as Cluster;

      setRecentCluster(cluster);

      expect(read()).toEqual(['beta']);
    });

    it('prepends the most recent cluster so the newest is first', () => {
      setRecentCluster('alpha');
      setRecentCluster('beta');
      setRecentCluster('gamma');

      expect(read()).toEqual(['gamma', 'beta', 'alpha']);
    });

    it('deduplicates by moving a re-added cluster to the front', () => {
      setRecentCluster('alpha');
      setRecentCluster('beta');
      setRecentCluster('alpha');

      expect(read()).toEqual(['alpha', 'beta']);
    });

    it('caps the list at three entries, dropping the oldest', () => {
      setRecentCluster('alpha');
      setRecentCluster('beta');
      setRecentCluster('gamma');
      setRecentCluster('delta');

      expect(read()).toEqual(['delta', 'gamma', 'beta']);
    });

    it('handles a string and Cluster-object mix without duplicating the entry', () => {
      setRecentCluster('alpha');
      setRecentCluster({ name: 'alpha' } as Cluster);

      expect(read()).toEqual(['alpha']);
    });
  });

  describe('getRecentClusters', () => {
    it('returns an empty array when no entry exists', () => {
      expect(getRecentClusters()).toEqual([]);
    });

    it('returns the stored list as-is', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(['a', 'b', 'c']));

      expect(getRecentClusters()).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty array when the stored value is not an array', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ unexpected: 'shape' }));

      expect(getRecentClusters()).toEqual([]);
    });

    it('returns an empty array when the stored value is a JSON null', () => {
      localStorage.setItem(STORAGE_KEY, 'null');

      expect(getRecentClusters()).toEqual([]);
    });

    // Documents current behaviour: a corrupted payload surfaces as a parse
    // error rather than silently falling back to []. A future change could
    // add defensive recovery; this test should be updated alongside it.
    it('throws when the stored payload is not valid JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not json');

      expect(() => getRecentClusters()).toThrow(SyntaxError);
    });
  });
});
