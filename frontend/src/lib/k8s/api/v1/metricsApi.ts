import { isDebugVerbose } from '../../../../helpers/debugVerbose';
import { getCluster } from '../../../cluster';
import { KubeMetrics } from '../../cluster';
import { ApiError } from '../v2/ApiError';
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
