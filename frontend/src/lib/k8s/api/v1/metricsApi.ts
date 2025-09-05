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
import type { KubeMetrics } from '../../cluster';
import type { ApiError } from '../v2/ApiError';
import { clusterRequest } from './clusterRequests';

/**
 * Gets the metrics for the specified resource. Gets new metrics every 10 seconds.
 *
 * @param url - The url of the resource to get metrics for.
 * @param onMetrics - The function to call with the metrics.
 * @param onError - The function to call if there's an error.
 * @param cluster - The cluster to get metrics for. By default uses the current cluster (URL defined).
 *
 * @returns A function to cancel the metrics request.
 */
export async function metrics(
  url: string,
  onMetrics: (arg: KubeMetrics[]) => void,
  onError?: (err: ApiError) => void,
  cluster?: string
) {
  const handle = setInterval(getMetrics, 10000);

  const clusterName = cluster || getCluster();

  async function getMetrics() {
    try {
      const metric = await clusterRequest(url, { cluster: clusterName });
      onMetrics(metric.items || metric);
    } catch (err) {
      if (isDebugVerbose('k8s/apiProxy@metrics')) {
        console.debug('k8s/apiProxy@metrics', { err, url });
      }

      if (onError) {
        onError(err as ApiError);
      }
    }
  }

  function cancel() {
    clearInterval(handle);
  }

  getMetrics();

  return cancel;
}
