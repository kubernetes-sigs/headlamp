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

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as metricsApi from './api/v1/metricsApi';
import * as nodeSummaryApi from './api/v2/nodeSummaryApi';
import * as index from './index';
import { useNodeMetrics, useNodeSummaryStats } from './nodeHooks';

vi.mock('./index', () => ({
  useConnectApi: vi.fn(() => {}),
}));

vi.mock('./api/v1/metricsApi', () => ({
  metrics: vi.fn(),
}));

vi.mock('./api/v2/nodeSummaryApi', () => ({
  nodeSummaryStats: vi.fn(),
}));

describe('nodeHooks', () => {
  describe('useNodeMetrics', () => {
    it('should call useConnectApi with bound metrics api call', () => {
      const mockUseConnectApi = vi.spyOn(index, 'useConnectApi');
      const mockMetrics = vi.spyOn(metricsApi, 'metrics');

      renderHook(() => useNodeMetrics('my-cluster'));

      expect(mockUseConnectApi).toHaveBeenCalled();

      const apiCallArg = mockUseConnectApi.mock.calls[0][0] as any;

      // We can't easily assert on the exact bound function,
      // but we know it's a bound version of `metrics`.
      // The first bound arg is the url, the next are setMetrics, setError, cluster
      expect(typeof apiCallArg).toBe('function');

      apiCallArg();

      expect(mockMetrics).toHaveBeenCalledWith(
        '/apis/metrics.k8s.io/v1beta1/nodes',
        expect.any(Function), // setMetrics
        expect.any(Function), // setError
        'my-cluster'
      );
    });
  });

  describe('useNodeSummaryStats', () => {
    it('should call useConnectApi with bound nodeSummaryStats api call', () => {
      const mockUseConnectApi = vi.spyOn(index, 'useConnectApi');
      const mockNodeSummaryStats = vi.spyOn(nodeSummaryApi, 'nodeSummaryStats');

      renderHook(() => useNodeSummaryStats('my-node', 'my-cluster'));

      expect(mockUseConnectApi).toHaveBeenCalled();

      const apiCallArg = mockUseConnectApi.mock.calls[0][0] as any;
      expect(typeof apiCallArg).toBe('function');

      apiCallArg();

      expect(mockNodeSummaryStats).toHaveBeenCalledWith(
        'my-node',
        expect.any(Function), // setStats
        expect.any(Function), // setError
        'my-cluster'
      );
    });
  });
});
