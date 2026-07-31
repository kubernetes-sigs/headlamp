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

/**
 * Standalone custom hooks for Node-specific data fetching.
 *
 * Logic extracted from Node.useMetrics and Node.useNodeSummaryStats static
 * methods to make them valid React hook call sites, removing the need for
 * `eslint-disable-next-line react-hooks/rules-of-hooks` suppressions.
 */

import React from 'react';
import { useErrorState } from '../util';
import { useConnectApi } from '.';
import { metrics } from './api/v1/metricsApi';
import type { ApiError } from './api/v2/ApiError';
import { KubeNodeSummaryStats, nodeSummaryStats } from './api/v2/nodeSummaryApi';
import type { KubeMetrics } from './cluster';

/**
 * Standalone hook equivalent of Node.useMetrics.
 *
 * Fetches node metrics from the Kubernetes metrics API server.
 *
 * @param cluster - Optional cluster name to fetch metrics from.
 * @returns A tuple of [metrics array or null, error or null].
 */
export function useNodeMetrics(cluster?: string): [KubeMetrics[] | null, ApiError | null] {
  const [nodeMetrics, setNodeMetrics] = React.useState<KubeMetrics[] | null>(null);
  const [error, setError] = useErrorState(setNodeMetrics);

  function setMetrics(metricsData: KubeMetrics[]) {
    setNodeMetrics(metricsData);
    setError(null);
  }

  useConnectApi(
    metrics.bind(null, '/apis/metrics.k8s.io/v1beta1/nodes', setMetrics, setError, cluster)
  );

  return [nodeMetrics, error];
}

/**
 * Standalone hook equivalent of Node.useNodeSummaryStats.
 *
 * Fetches summary statistics for a specific node from the kubelet summary API.
 *
 * @param nodeName - Name of the node to fetch summary stats for.
 * @param cluster - Optional cluster name.
 * @returns A tuple of [summary stats or null, error or null].
 */
export function useNodeSummaryStats(
  nodeName?: string,
  cluster?: string
): [KubeNodeSummaryStats | null, ApiError | null] {
  const [summaryStats, setSummaryStats] = React.useState<KubeNodeSummaryStats | null>(null);
  const [error, setError] = useErrorState(setSummaryStats);

  function setStats(stats: KubeNodeSummaryStats) {
    setSummaryStats(stats);
    setError(null);
  }

  useConnectApi(nodeSummaryStats.bind(null, nodeName || '', setStats, setError, cluster));

  return [summaryStats, error];
}
