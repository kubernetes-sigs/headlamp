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

import { clusterRequest } from '../../../lib/k8s/api/v1/clusterRequests';
import { useTypedSelector } from '../../../redux/hooks';

/**
 * Whether the copy/download kubeconfig actions should be offered for the
 * given cluster.
 *
 * Stateless (browser-imported) clusters are always exportable: the backend
 * only ever returns credentials the requesting user supplied themselves.
 * Server-stored clusters (kubeconfig-file, dynamic, in-cluster) are offered
 * only when the backend advertises the capability on /config, which is true
 * exactly when a trust boundary for stored credentials is in place (see
 * kubeconfigExportCapabilityEnabled on the backend). Without this the UI
 * would offer actions guaranteed to fail with 403 on those deployments.
 */
export function useKubeconfigExportEnabled(clusterName: string | null | undefined): boolean {
  const exportEnabled = useTypedSelector(state => state.config.kubeconfigExportEnabled);
  const isStateless = useTypedSelector(
    state => !!clusterName && !!state.config.statelessClusters?.[clusterName]
  );

  return isStateless || exportEnabled;
}

/**
 * Fetches a standalone, single-context kubeconfig YAML for the given cluster from the
 * backend. This works for any cluster type (kubeconfig file, dynamically-added, or
 * stateless/browser-imported) since the backend builds it from whatever it already
 * holds in memory for that cluster, rather than requiring the original file.
 *
 * @throws When the backend has no kubeconfig for this cluster (e.g. 404) or the
 * request otherwise fails. Callers that drive a UI affordance should catch this
 * and surface the failure (CopyButton does this via its `onError` callback).
 */
export async function getClusterKubeconfigYaml(clusterName: string): Promise<string> {
  const response: Response = await clusterRequest('/kubeconfig', {
    cluster: clusterName,
    isJSON: false,
  });
  return await response.text();
}

/** Triggers a browser download of the given kubeconfig YAML as `<clusterName>-kubeconfig.yaml`. */
export function downloadKubeconfigYaml(clusterName: string, kubeconfigYaml: string) {
  const blob = new Blob([kubeconfigYaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clusterName}-kubeconfig.yaml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
