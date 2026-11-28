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

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import { useEffect, useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { decodeBase64 } from '../helpers/base64';
import {
  clusterConfigReadiness,
  clusterPreOpenOptions,
  withPreparedCluster,
} from '../lib/clusterPreOpen';
import { useClustersConf } from '../lib/k8s';
import { ApiError } from '../lib/k8s/api/v2/ApiError';
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
 * Returns the parsed settings.json data, or null when it is absent.
 *
 * Fetches use the user's own credentials via `clusterFetch`, so Kubernetes RBAC
 * gates access: a user only receives source contents (including Secret data)
 * they could already read with `kubectl get`. Marking a setting as `hidden` or
 * `disabled` is a UI affordance, not a confidentiality boundary — anything
 * sensitive must be protected via RBAC on the underlying ConfigMap/Secret.
 */
export async function fetchSource(
  clusterName: string,
  source: SettingsSource,
  signal: AbortSignal = new AbortController().signal
): Promise<Record<string, any> | null> {
  const ns = source.namespace ?? 'headlamp-tools';
  const isSecret = source.type?.toLowerCase() === 'secret';
  const resourceType = isSecret ? 'secrets' : 'configmaps';
  const url = `/api/v1/namespaces/${ns}/${resourceType}/${source.name}`;

  signal.throwIfAborted();
  const response = await clusterFetch(url, { cluster: clusterName, method: 'GET', signal });
  const resource = await response.json();

  let raw: string | undefined;
  if (isSecret) {
    const encoded = resource?.data?.[SETTINGS_DATA_KEY];
    if (typeof encoded === 'string') {
      raw = decodeBase64(encoded);
    }
  } else {
    raw = resource?.data?.[SETTINGS_DATA_KEY];
  }
  if (typeof raw !== 'string') {
    return null;
  }
  return JSON.parse(raw);
}

/**
 * Fetches and merges settings from all sources for a single cluster.
 * Sources are merged in order: later sources override earlier ones.
 */
async function fetchClusterSources(
  clusterName: string,
  sources: SettingsSource[],
  signal: AbortSignal
): Promise<Record<string, any> | null> {
  let merged: Record<string, any> | null = null;
  const errors: unknown[] = [];

  for (const source of sources) {
    try {
      const data = await fetchSource(clusterName, source, signal);
      if (data !== null) {
        merged = merged ? deepMerge(merged, data) : structuredClone(data);
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof ApiError && error.status === 404) continue;
      console.error('Error getting cluster settings source:', error);
      errors.push(error);
    }
  }

  // Publish real partial results as before, but never replace prior settings
  // with an empty success when every usable source failed.
  if (merged === null && errors.length > 0) throw errors[0];
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
export async function fetchAllClusterSettings(
  sources: Record<string, SettingsSource[]>,
  knownClusters: string[],
  signal: AbortSignal = new AbortController().signal
): Promise<Record<string, any>> {
  const targets = resolveClusterNames(sources, knownClusters);
  if (targets.length === 0) {
    return {};
  }

  const entries = await Promise.all(
    targets.map(async ({ clusterName, clusterSources }) => {
      const data = await fetchClusterSources(clusterName, clusterSources, signal);
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
 * Each target is prepared independently, after plugin registration and config
 * loading. A background read retains preparation only until that read finishes.
 */
export function useClusterDefinedSettings() {
  const dispatch = useDispatch();
  const client = useQueryClient();
  const sources = useTypedSelector(state => state.adminSettings.sources);
  const clusters = useClustersConf();
  const pluginsLoaded = useTypedSelector(state => state.plugins.loaded);
  const pluginLoadError = useTypedSelector(state => state.plugins.loadError);
  const revision = useTypedSelector(state => state.clusterProvider.preOpenHooksRevision);
  const config = useTypedSelector(state => state.config);
  const clusterSettings = useTypedSelector(state => state.adminSettings.clusterSettings);
  const targets = useMemo(
    () => resolveClusterNames(sources, Object.keys(clusters ?? {})),
    [sources, clusters]
  );

  useEffect(
    () =>
      client.getQueryCache().subscribe(event => {
        if (
          event.type === 'updated' &&
          event.action.type === 'success' &&
          event.query.queryKey[0] === 'clusterPreOpen'
        ) {
          // A gate retry can recover a failed settings read. Refetch immediately,
          // but do not interrupt a read already waiting on this preparation.
          void client.invalidateQueries({
            predicate: query =>
              query.queryKey[0] === 'cluster-defined-settings' &&
              query.queryKey[1] === event.query.queryKey[1] &&
              query.state.fetchStatus !== 'fetching',
          });
        }
      }),
    [client]
  );

  const data = useQueries({
    queries: targets.map(({ clusterName, clusterSources }) => {
      const preparation = clusterPreOpenOptions(
        clusterName,
        clusters![clusterName],
        true,
        revision,
        dispatch,
        Object.hasOwn(config.statelessClusters ?? {}, clusterName)
      );
      return {
        queryKey: ['cluster-defined-settings', clusterName, clusterSources, preparation.queryKey],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          withPreparedCluster(client, preparation, signal, () =>
            fetchClusterSources(clusterName, clusterSources, signal)
          ),
        enabled:
          pluginsLoaded && !pluginLoadError && clusterConfigReadiness(clusters, config).ready,
        retry: false,
        refetchInterval: REFETCH_INTERVAL,
      };
    }),
    combine: results =>
      Object.fromEntries(
        results.flatMap((result, index) =>
          result.isSuccess && result.data !== undefined
            ? [[targets[index].clusterName, result.data]]
            : []
        )
      ),
  });

  useEffect(() => {
    if (clusters === null) return;
    const nextSettings = Object.fromEntries(
      targets.flatMap(({ clusterName }) => {
        // A new hook revision has no result yet; retain only real prior reads,
        // not success-shaped query data that would conceal preparation errors.
        const settings = Object.hasOwn(data, clusterName)
          ? data[clusterName]
          : clusterSettings[clusterName];
        return settings ? [[clusterName, settings]] : [];
      })
    );
    if (!isEqual(nextSettings, clusterSettings)) dispatch(setClusterSettings(nextSettings));
  }, [data, targets, clusters, clusterSettings, dispatch]);
}
