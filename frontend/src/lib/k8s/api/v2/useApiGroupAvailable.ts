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

import { useQuery } from '@tanstack/react-query';
import { ApiError } from './ApiError';
import { clusterFetch } from './fetch';

/**
 * Checks whether the given API group/version is served by the connected cluster,
 * by querying the cluster's `/apis/<group>/<version>` discovery endpoint.
 *
 * This is useful for optional, CRD-backed API groups (e.g. Gateway API) that may
 * or may not be installed on a given cluster, so that UI relying on them (like
 * sidebar entries) can be hidden or show a clear "not available" state instead of
 * always rendering and leading to an empty or erroring resource list.
 *
 * @param group - The API group to check, e.g. `gateway.networking.k8s.io`.
 * @param version - The API version to check, e.g. `v1`.
 * @param cluster - The cluster to check against. The check is disabled (and this
 * hook returns `undefined`) if no cluster is given.
 *
 * @returns `true` if the API group/version is available, `false` if it is confirmed
 * not to be served (e.g. a 404 from the discovery endpoint), and `undefined` while
 * the check is still in progress, no cluster is set, or the check failed for a
 * reason other than the API group not being served (e.g. a network error or an
 * authorization failure).
 */
export function useApiGroupAvailable(
  group: string,
  version: string,
  cluster?: string | null
): boolean | undefined {
  const { data } = useQuery<boolean | null, unknown>({
    queryKey: ['apiGroupAvailable', cluster, group, version],
    enabled: !!cluster,
    staleTime: 60_000,
    queryFn: async () => {
      try {
        await clusterFetch(`/apis/${group}/${version}`, {
          cluster: cluster as string,
        });
        return true;
      } catch (e) {
        // Only a 404 reliably means the API group/version isn't served by the
        // cluster. Other failures (network errors, RBAC/403, etc.) shouldn't be
        // treated as "not available", so we leave them as unknown (null, mapped
        // to undefined below) and let the UI keep its default behavior.
        if (e instanceof ApiError && e.status === 404) {
          return false;
        }
        return null;
      }
    },
  });

  return data ?? undefined;
}
