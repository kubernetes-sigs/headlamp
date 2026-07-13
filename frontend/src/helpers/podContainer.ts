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

import Pod from '../lib/k8s/pod';

/**
 * Returns all containers in a pod across spec.containers, spec.initContainers,
 * and spec.ephemeralContainers.
 *
 * @param item - The pod object to check.
 * @returns Array of all container specs (main, init, and ephemeral).
 */
export function getAllContainers(item: Pod): Array<{ name: string }> {
  return [
    ...(item.spec?.containers ?? []),
    ...(item.spec?.initContainers ?? []),
    ...(item.spec?.ephemeralContainers ?? []),
  ];
}

/**
 * Returns `preferredName` if it matches a known container in the pod, otherwise
 * falls back to {@link getDefaultContainer}.
 *
 * @param item - The pod object to check.
 * @param preferredName - The container name requested (e.g. from a query param).
 * @returns A valid container name for the pod.
 */
export function resolveContainerName(item: Pod, preferredName: string | undefined): string {
  if (preferredName && getAllContainers(item).some(c => c.name === preferredName)) {
    return preferredName;
  }
  return getDefaultContainer(item);
}

/**
 * Gets the default container name for a pod based on its current execution state.
 *
 * It prioritizes running main containers, then running init containers,
 * falling back to the first container in the spec if none are running.
 *
 * @param item - The pod object to check.
 * @returns The name of the default container or an empty string if none exist.
 */
export function getDefaultContainer(item: Pod): string {
  if (!item) {
    return '';
  }

  // Prefer a running main container
  const runningMain = item.status?.containerStatuses?.find(s => s.state?.running);
  if (runningMain) {
    return runningMain.name;
  }

  // Otherwise use running init container
  const runningInit = item.status?.initContainerStatuses?.find(s => s.state?.running);
  if (runningInit) {
    return runningInit.name;
  }

  // Fallback to first main container
  return item.spec?.containers?.[0]?.name ?? '';
}
