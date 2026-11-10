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

import { getClusterDisplayName } from '../../../helpers/clusterPresentation';
import { useClustersConf } from '../../../lib/k8s';

/**
 * Sorts clusters by display name while preserving connection keys and source objects.
 *
 * @param clusters - The clusters configuration, or null while it is loading.
 * @returns The clusters sorted by display name, then by connection key. Empty while loading.
 */
export function getCustomClusterNames(clusters: ReturnType<typeof useClustersConf>) {
  return Object.values(clusters || {}).sort(
    (a, b) =>
      getClusterDisplayName(a).localeCompare(getClusterDisplayName(b)) ||
      a.name.localeCompare(b.name)
  );
}
