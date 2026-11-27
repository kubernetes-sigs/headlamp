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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAutoConnectClusterNames,
  getAutoConnectPolicy,
  setAutoConnectPolicy,
  useAutoConnectClusters,
} from './clusterAutoConnect';
import { getRecentClusters, setRecentCluster } from './recentClusters';

const requestMock = vi.hoisted(() => vi.fn(() => Promise.resolve({})));

vi.mock('../lib/k8s/api/v1/clusterRequests', () => ({
  request: requestMock,
}));

describe('clusterAutoConnect', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    requestMock.mockClear();
  });

  describe('getAutoConnectClusterNames', () => {
    it('defaults to none (returns no clusters even when recent clusters exist)', () => {
      setRecentCluster('b');
      expect(getAutoConnectPolicy()).toBe('none');
      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual([]);
    });

    it('returns only recently-used clusters when policy is recent', () => {
      setAutoConnectPolicy('recent');
      setRecentCluster('gone');
      setRecentCluster('b');

      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual(['b']);
    });

    it('returns all clusters when policy is all', () => {
      setAutoConnectPolicy('all');
      expect(getAutoConnectClusterNames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    });
  });

  describe('useAutoConnectClusters', () => {
    it('does not auto-connect by default', () => {
      setRecentCluster('b');

      const { result } = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));

      expect([...result.current.connectedClusters]).toEqual([]);
    });

    it('adds a cluster to the connected set when connect is called', () => {
      const { result } = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));

      act(() => result.current.connect('a'));

      expect([...result.current.connectedClusters]).toEqual(['a']);
      expect(getRecentClusters()).toContain('a');
    });

    it('disconnects a cluster, calls DELETE /connection, and persists disconnect across remounts', () => {
      setAutoConnectPolicy('recent');
      setRecentCluster('b');

      const first = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));
      expect([...first.result.current.connectedClusters]).toEqual(['b']);

      act(() => first.result.current.disconnect('b'));
      expect([...first.result.current.connectedClusters]).toEqual([]);
      expect(requestMock).toHaveBeenCalledWith(
        '/clusters/b/connection',
        { method: 'DELETE' },
        false,
        false
      );

      first.unmount();

      // Remounting in the same session keeps 'b' disconnected despite 'recent' policy.
      const second = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));
      expect([...second.result.current.connectedClusters]).toEqual([]);
    });

    it('keeps on-demand connected clusters across remounts', () => {
      const first = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));
      act(() => first.result.current.connect('b'));
      first.unmount();

      const second = renderHook(() => useAutoConnectClusters(['a', 'b', 'c']));
      expect([...second.result.current.connectedClusters]).toContain('b');
    });
  });
});
