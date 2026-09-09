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

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAutoConnectClusterNames, useAutoConnectClusters } from './clusterAutoConnect';
import { getRecentClusters, setRecentCluster } from './recentClusters';

describe('clusterAutoConnect', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('getAutoConnectClusterNames', () => {
    it('returns no clusters when there are no recent clusters', () => {
      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual([]);
    });

    it('returns only the recently-used clusters', () => {
      setRecentCluster('b');

      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual(['b']);
    });

    it('ignores recent clusters that are no longer available', () => {
      setRecentCluster('gone');
      setRecentCluster('b');

      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual(['b']);
    });

    it('preserves the order of the provided cluster names', () => {
      setRecentCluster('a');
      setRecentCluster('c');

      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual(['a', 'c']);
    });
  });

  describe('useAutoConnectClusters', () => {
    it('connects only to recently-used clusters by default', () => {
      setRecentCluster('b');

      const { result } = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));

      expect([...result.current.connectedClusters]).toEqual(['b']);
    });

    it('adds a cluster to the connected set when connect is called', () => {
      const { result } = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));

      expect([...result.current.connectedClusters]).toEqual([]);

      act(() => result.current.connect('a'));

      expect([...result.current.connectedClusters]).toEqual(['a']);
    });

    it('records a connected cluster as recently-used', () => {
      const { result } = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));

      act(() => result.current.connect('a'));

      expect(getRecentClusters()).toContain('a');
    });

    it('keeps earlier-connected clusters when newer ones are connected (no eviction)', () => {
      const { result } = renderHook(() => useAutoConnectClusters(['a', 'b', 'c', 'd']));

      act(() => result.current.connect('a'));
      act(() => result.current.connect('b'));
      act(() => result.current.connect('c'));
      act(() => result.current.connect('d'));

      // recent_clusters is capped at 3, but the connected set is not.
      expect([...result.current.connectedClusters].sort()).toEqual(['a', 'b', 'c', 'd']);
    });

    it('keeps on-demand connected clusters across remounts', () => {
      const first = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));
      act(() => first.result.current.connect('b'));
      first.unmount();

      // A fresh mount (e.g. Home remounting when the cluster list changes) still
      // considers the on-demand connected cluster connected.
      const second = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));
      expect([...second.result.current.connectedClusters]).toContain('b');
    });
  });
});
