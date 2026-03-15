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
import { useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { clusterFetch } from '../lib/k8s/api/v2/fetch';
import type { SettingsSource } from '../redux/adminSettingsSlice';
import { setClusterSettings } from '../redux/adminSettingsSlice';
import { useTypedSelector } from '../redux/hooks';

const SETTINGS_DATA_KEY = 'settings.json';
const REFETCH_INTERVAL = 60_000; // 1 minute

/**
 * Fetches a single source (ConfigMap or Secret) from a cluster.
 * Returns the parsed settings.json data, or null on failure.
 */
async function fetchSource(
  clusterName: string,
  source: SettingsSource
): Promise<Record<string, any> | null> {
  const ns = source.namespace ?? 'headlamp-tools';
  const resourceType = source.type === 'secret' ? 'secrets' : 'configmaps';
  const url = `/api/v1/namespaces/${ns}/${resourceType}/${source.name}`;

  try {
    const response = await clusterFetch(url, { cluster: clusterName, method: 'GET' });
    const resource = await response.json();

    let raw: string | undefined;
    if (source.type === 'secret') {
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
  sources: SettingsSource[]
): Promise<Record<string, any> | null> {
  let merged: Record<string, any> | null = null;

  for (const source of sources) {
    const data = await fetchSource(clusterName, source);
    if (data !== null) {
      merged = merged ? Object.assign({}, merged, data) : data;
    }
  }

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
 * Fetches cluster-defined settings for all allowed clusters.
 * Returns a map of cluster name to settings object.
 */
async function fetchAllClusterSettings(
  sources: Record<string, SettingsSource[]>,
  knownClusters: string[]
): Promise<Record<string, any>> {
  const targets = resolveClusterNames(sources, knownClusters);
  if (targets.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    targets.map(async ({ clusterName, clusterSources }) => {
      const data = await fetchClusterSources(clusterName, clusterSources);
      return data !== null ? ([clusterName, data] as const) : null;
    })
  );

  const result: Record<string, any> = {};
  for (const entry of entries) {
    if (entry !== null) {
      result[entry[0]] = entry[1];
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

  const knownClusterNames = useMemo(() => (clusters ? Object.keys(clusters) : []), [clusters]);

  const hasSources = Object.keys(sources).length > 0;

  const { data } = useQuery({
    queryKey: ['cluster-defined-settings', sources, knownClusterNames],
    queryFn: () => fetchAllClusterSettings(sources, knownClusterNames),
    enabled: hasSources && knownClusterNames.length > 0,
    refetchInterval: REFETCH_INTERVAL,
  });

  useEffect(() => {
    if (data) {
      dispatch(setClusterSettings(data));
    }
  }, [data, dispatch]);
}
