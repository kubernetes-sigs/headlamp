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

import type Deployment from '../../lib/k8s/deployment';

/**
 * Compares deployments by their available and total replicas, as shown in the Pods column.
 *
 * The API omits replicas and availableReplicas when they are zero, so they are treated
 * as such here. Subtracting them directly would give NaN and leave those rows in an
 * arbitrary order.
 */
export function sortByPods(d1: Deployment, d2: Deployment) {
  const { replicas: r1, availableReplicas: avail1 } = d1.status;
  const { replicas: r2, availableReplicas: avail2 } = d2.status;

  const availSorted = (avail1 ?? 0) - (avail2 ?? 0);
  if (availSorted === 0) {
    return (r1 ?? 0) - (r2 ?? 0);
  }

  return availSorted;
}
