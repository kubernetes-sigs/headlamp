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

import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { getCluster } from '../../../cluster';
import type { ApiError } from './ApiError';
import { clusterFetch } from './fetch';

export interface KubeNodeSummaryStats {
  node?: {
    fs?: {
      availableBytes?: number;
      capacityBytes?: number;
      usedBytes?: number;
    };
  };
}

/**
 * Gets kubelet summary stats for a node. Fetches new stats every 10 seconds.
 *
 * @param nodeName - The node name.
 * @param onStats - The function to call with the node summary stats.
 * @param onError - The function to call if there's an error.
 * @param cluster - The cluster to get stats for. By default uses the current cluster (URL defined).
 *
 * @returns A function to cancel the polling request.
 */
export async function nodeSummaryStats(
  nodeName: string,
  onStats: (arg: KubeNodeSummaryStats) => void,
  onError?: (err: ApiError) => void,
  cluster?: string
) {
  if (!nodeName) {
    return () => {};
  }

  const handle = setInterval(getNodeSummaryStats, 10000);
  const clusterName = cluster || getCluster() || '';

  async function getNodeSummaryStats() {
    try {
      const summary: KubeNodeSummaryStats = await clusterFetch(
        `/api/v1/nodes/${encodeURIComponent(nodeName)}/proxy/stats/summary`,
        { cluster: clusterName }
      ).then(response => response.json());
      onStats(summary);
    } catch (err) {
      if (isDebugVerbose('k8s/apiProxy@nodeSummaryStats')) {
        console.debug('k8s/apiProxy@nodeSummaryStats', { err, nodeName });
      }

      if (onError) {
        onError(err as ApiError);
      }
    }
  }

  function cancel() {
    clearInterval(handle);
  }

  getNodeSummaryStats();

  return cancel;
}
