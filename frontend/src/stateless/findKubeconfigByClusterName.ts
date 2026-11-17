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

import * as jsyaml from 'js-yaml';
import { decodeBase64 } from '../helpers/base64';
import { KubeconfigObject } from '../lib/k8s/kubeconfig';
import { findMatchingContexts } from '.';
import { visitKubeconfigRows } from './visitKubeconfigRows';

/**
 * Finds a kubeconfig by cluster name.
 * @param clusterName The name of the cluster to find.
 * @param clusterID The ID for a cluster, composed of the kubeconfig path and cluster name
 * @returns A promise that resolves with the kubeconfig, or null if not found.
 * @throws Error if IndexedDB is not supported.
 * @throws Error if the kubeconfig is invalid.
 */

export function findKubeconfigByClusterName(
  /** The name of the cluster to find */
  clusterName: string,
  /** The ID for a cluster, composed of the kubeconfig path and cluster name */
  clusterID?: string
): Promise<string | null> {
  return visitKubeconfigRows<string | null>('readonly', cursor => {
    if (!cursor) {
      return { value: null };
    }
    const kubeconfig = cursor.value.kubeconfig;
    const parsed = jsyaml.load(decodeBase64(kubeconfig)) as KubeconfigObject;
    const { matchingKubeconfig, matchingContext } = findMatchingContexts(
      clusterName,
      parsed,
      clusterID
    );
    if (matchingKubeconfig || matchingContext) {
      return { value: kubeconfig };
    }
  });
}
