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

import React from 'react';
import {
  clearResolvedAllowedNamespaces,
  isResolvedAllowedNamespacesStale,
  loadResolvedAllowedNamespaces,
  storeResolvedAllowedNamespaces,
} from '../../helpers/clusterSettings';
import type { ApiError } from './api/v2/ApiError';
import Namespace from './namespace';

function sortedNamespaceNames(items: Namespace[] | null): string[] {
  return (items ?? [])
    .map(item => item.metadata.name)
    .filter(Boolean)
    .sort();
}

function sameNamespaces(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Resolves the namespaces matching a cluster's label selector and keeps the
 * localStorage cache read by getCombinedAllowedNamespaces in sync.
 *
 * The resolution goes through Namespace.useList so it benefits from react-query
 * caching, retry and websocket watching. Because the query is keyed on the
 * selector, results are always tagged to the selector that produced them, which
 * avoids an older in-flight request overwriting a newer one.
 *
 * Cache behaviour:
 * - success: the resolved names are cached, stamped with the selector and time;
 * - failure: the cache is cleared (fail closed) so a stale list is not kept;
 * - empty selector: any previously cached list is cleared.
 *
 * @param cluster - The cluster to resolve the namespaces for.
 * @param selector - The configured label selector (may be undefined/empty).
 * @returns The resolved namespace names plus the current fetching/error state,
 *          for callers (e.g. the settings UI) that want to surface them.
 */
export function useAllowedNamespacesFromSelector(
  cluster: string,
  selector?: string
): { namespaces: string[]; isFetching: boolean; error: ApiError | null } {
  const trimmedSelector = (selector ?? '').trim();
  const enabled = Boolean(cluster && trimmedSelector);

  const { items, error, isError, isFetching } = Namespace.useList({
    clusters: enabled ? [cluster] : [],
    labelSelector: enabled ? trimmedSelector : undefined,
  });

  const namespaces = React.useMemo(() => sortedNamespaceNames(items), [items]);

  React.useEffect(() => {
    if (!cluster) {
      return;
    }
    // No selector: drop any list left over from a previously configured one.
    if (!trimmedSelector) {
      clearResolvedAllowedNamespaces(cluster);
      return;
    }
    // Failed resolution (after retries): fail closed rather than keep a stale list.
    if (isError) {
      clearResolvedAllowedNamespaces(cluster);
      return;
    }
    // Still loading: keep the existing cache to avoid a flash of unrestricted access.
    if (items === null) {
      return;
    }
    const cache = loadResolvedAllowedNamespaces(cluster);
    const changed =
      !cache || cache.selector !== trimmedSelector || !sameNamespaces(cache.namespaces, namespaces);
    // Rewrite when the data changed or the cache went stale (refreshes the timestamp).
    if (changed || isResolvedAllowedNamespacesStale(cluster)) {
      storeResolvedAllowedNamespaces(cluster, trimmedSelector, namespaces);
    }
  }, [cluster, trimmedSelector, isError, items, namespaces]);

  return {
    namespaces: enabled ? namespaces : [],
    isFetching: enabled && isFetching,
    error: isError ? error : null,
  };
}
