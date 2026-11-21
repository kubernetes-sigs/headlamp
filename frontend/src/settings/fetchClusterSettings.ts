/*
 * Copyright 2026 The Kubernetes Authors
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

import { useQueries } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useDiscoveredConnectionRevisions } from '../lib/k8s/api/v2/discoveredConnectionRevisions';
import { assertCurrentDiscoveryConnection } from '../lib/k8s/api/v2/discoveryConnection';
import { clusterFetch } from '../lib/k8s/api/v2/fetch';
import { useTypedSelector } from '../redux/hooks';
import type { SettingsSource } from './adminSettingsSlice';
import { setClusterSettings } from './adminSettingsSlice';

const SETTINGS_DATA_KEY = 'settings.json';
const REFETCH_INTERVAL = 60_000; // 1 minute

/**
 * Deep merges source into target. Arrays and non-plain-objects are overwritten,
 * plain objects are merged recursively. Returns the mutated target.
 */
function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const srcVal = source[key];
    const tgtVal = target[key];

    if (
      typeof srcVal === 'object' &&
      srcVal !== null &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      tgtVal !== null &&
      !Array.isArray(tgtVal)
    ) {
      target[key] = deepMerge(tgtVal, srcVal);
    } else {
      target[key] = srcVal;
    }
  }
  return target;
}

/**
 * Fetches a single source (ConfigMap or Secret) from a cluster.
 * Returns the parsed settings.json data, or null on failure.
 *
 * Fetches use the user's own credentials via `clusterFetch`, so Kubernetes RBAC
 * gates access: a user only receives source contents (including Secret data)
 * they could already read with `kubectl get`. Marking a setting as `hidden` or
 * `disabled` is a UI affordance, not a confidentiality boundary — anything
 * sensitive must be protected via RBAC on the underlying ConfigMap/Secret.
 */
async function fetchSource(
  clusterName: string,
  source: SettingsSource,
  revision?: string
): Promise<Record<string, any> | null> {
  const ns = source.namespace ?? 'headlamp-tools';
  const isSecret = source.type?.toLowerCase() === 'secret';
  const resourceType = isSecret ? 'secrets' : 'configmaps';
  const url = `/api/v1/namespaces/${ns}/${resourceType}/${source.name}`;

  try {
    const response = await clusterFetch(url, {
      cluster: clusterName,
      method: 'GET',
      expectedDiscoveryConnection: { revision },
    });
    const resource = await response.json();

    let raw: string | undefined;
    if (isSecret) {
      const encoded = resource?.data?.[SETTINGS_DATA_KEY];
      if (typeof encoded === 'string') {
        raw = atob(encoded);
      }
    } else {
      raw = resource?.data?.[SETTINGS_DATA_KEY];
    }

    if (typeof raw !== 'string') {
      return null;
    }

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Fetches and merges settings from all sources for a single cluster.
 * Sources are merged in order: later sources override earlier ones.
 */
async function fetchClusterSources(
  clusterName: string,
  sources: SettingsSource[],
  revision?: string
): Promise<Record<string, any> | null> {
  let merged: Record<string, any> | null = null;

  for (const source of sources) {
    assertCurrentDiscoveryConnection(clusterName, revision);
    const data = await fetchSource(clusterName, source, revision);
    if (data !== null) {
      merged = merged ? deepMerge(merged, data) : structuredClone(data);
    }
  }

  assertCurrentDiscoveryConnection(clusterName, revision);
  return merged;
}

/**
 * Resolves which clusters to fetch, expanding the "*" wildcard against known clusters.
 */
function resolveClusterNames(
  sources: Record<string, SettingsSource[]>,
  knownClusters: string[]
): { clusterName: string; clusterSources: SettingsSource[] }[] {
  const result: { clusterName: string; clusterSources: SettingsSource[] }[] = [];
  const wildcardSources = sources['*'];

  for (const cluster of knownClusters) {
    const specific = sources[cluster];
    if (!specific && !wildcardSources) {
      continue;
    }

    const merged = [...(wildcardSources ?? []), ...(specific ?? [])];
    if (merged.length > 0) {
      result.push({ clusterName: cluster, clusterSources: merged });
    }
  }

  return result;
}

/**
 * Hook that fetches cluster-defined settings and dispatches them to Redux.
 * Only active when admin settings include sources.
 */
export function useClusterDefinedSettings() {
  const dispatch = useDispatch();
  const sources = useTypedSelector(state => state.adminSettings.sources);
  const clusters = useTypedSelector(state => state.config.clusters);
  const revisions = useDiscoveredConnectionRevisions();
  const targets = resolveClusterNames(sources, Object.keys(clusters ?? {}));

  const data = useQueries({
    queries: targets.map(({ clusterName, clusterSources }) => {
      const revision = revisions.get(clusterName);
      return {
        queryKey: ['cluster-defined-settings', clusterName, revision, clusterSources],
        queryFn: () => fetchClusterSources(clusterName, clusterSources, revision),
        refetchInterval: REFETCH_INTERVAL,
      };
    }),
    combine: results =>
      Object.fromEntries(
        results.flatMap(({ data }, index) => (data ? [[targets[index].clusterName, data]] : []))
      ),
  });

  useEffect(() => {
    dispatch(setClusterSettings(data));
  }, [data, dispatch]);
}
