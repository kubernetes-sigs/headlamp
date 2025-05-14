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

import { useClustersConf } from '../../../lib/k8s';

/**
 * Gets the names of the clusters from the clusters configuration.
 * If the cluster has a custom name, it will be used instead of the default name.
 * The clusters are sorted by their names.
 *
 * @returns An array of name sorted clusters.
 */
export function getCustomClusterNames(clusters: ReturnType<typeof useClustersConf>) {
  if (clusters === null) {
    return [];
  }
  return Object.values(clusters)
    .map(c => ({
      ...c,
      name: c.meta_data?.extensions?.headlamp_info?.customName || c.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
