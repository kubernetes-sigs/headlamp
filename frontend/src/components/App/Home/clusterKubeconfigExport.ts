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

import * as yaml from 'js-yaml';
import { KubeconfigObject } from '../../../lib/k8s/kubeconfig';
import { findMatchingContexts } from '../../../stateless';

/**
 * Filters a full kubeconfig blob down to just the cluster, user, and context entries
 * for a single cluster, so the exported file doesn't leak credentials for unrelated
 * clusters that happen to share the same kubeconfig source.
 *
 * The cluster may have been renamed in Headlamp (a `headlamp_info.customName`
 * extension on the context), in which case `clusterName` won't match the context's
 * own `name`. `findMatchingContexts` accounts for that, and the actual context name
 * (not the possibly-renamed `clusterName`) is preserved as `current-context` so the
 * exported kubeconfig remains valid for tools like kubectl.
 *
 * @returns The filtered kubeconfig as YAML, or null if no matching context is found.
 */
export function filterKubeconfigForCluster(
  full: KubeconfigObject,
  clusterName: string,
  clusterID?: string
): string | null {
  const { matchingContext, matchingKubeconfig } = findMatchingContexts(
    clusterName,
    full,
    clusterID
  );
  const context = matchingContext ?? matchingKubeconfig;
  if (!context) {
    return null;
  }

  const matchedCluster = full.clusters?.find(c => c.name === context.context.cluster);
  const matchedUser = full.users?.find(u => u.name === context.context.user);

  const filtered: KubeconfigObject = {
    apiVersion: full.apiVersion ?? 'v1',
    kind: full.kind ?? 'Config',
    'current-context': context.name,
    clusters: matchedCluster ? [matchedCluster] : [],
    users: matchedUser ? [matchedUser] : [],
    contexts: [context],
  };
  return yaml.dump(filtered);
}
