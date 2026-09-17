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

import { describe, expect, it, vi } from 'vitest';
import { clusterRequest } from '../../../lib/k8s/api/v1/clusterRequests';
import { getClusterKubeconfigYaml } from './clusterKubeconfigExport';

vi.mock('../../../lib/k8s/api/v1/clusterRequests', () => ({
  clusterRequest: vi.fn(),
}));

describe('getClusterKubeconfigYaml', () => {
  it('returns the kubeconfig YAML text from the backend for the given cluster', async () => {
    const yamlText = 'apiVersion: v1\nkind: Config\n';
    vi.mocked(clusterRequest).mockResolvedValueOnce(new Response(yamlText));

    const result = await getClusterKubeconfigYaml('my-cluster');

    expect(clusterRequest).toHaveBeenCalledWith('/kubeconfig', {
      cluster: 'my-cluster',
      isJSON: false,
    });
    expect(result).toBe(yamlText);
  });

  it('returns null when the backend has no kubeconfig for the cluster', async () => {
    vi.mocked(clusterRequest).mockRejectedValueOnce(new Error('Not Found'));

    const result = await getClusterKubeconfigYaml('missing-cluster');

    expect(result).toBeNull();
  });
});
