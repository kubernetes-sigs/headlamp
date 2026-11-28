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

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { useDispatch } from 'react-redux';
import { clusterConfigReadiness, clusterPreOpenOptions } from '../../lib/clusterPreOpen';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { hasClusterPreOpenHooks } from '../../plugin/clusterPreOpen';
import { reloadPage } from '../../plugin/pluginsSlice';
import { useTypedSelector } from '../../redux/hooks';
import { fetchStatelessClusterKubeConfigs } from '../../stateless';

/** Preparation state for the active or requested destination cluster. */
export interface ClusterPreOpenState {
  /** Whether a single cluster needs configuration loading or registered hooks. */
  enabled: boolean;
  /** All hooks resolved; the cluster's views may render. */
  isSuccess: boolean;
  /** A hook rejected; `error` carries the reason. */
  isError: boolean;
  error: unknown;
  /** The latest progress message a hook reported, if any. */
  message?: string;
  /** Retries failed configuration loading or hooks, as appropriate. */
  retry: () => void;
}

/**
 * Runs registered hooks once per open. The router can observe a destination
 * before committing its location; the cold-load gate observes the active cluster.
 *
 * Hooks let plugins prepare a cluster (start a proxy, refresh credentials, write
 * a kubeconfig context, …) before its views load. They run for a single opened
 * cluster only; in multi-cluster mode preparation cannot be attributed to one
 * cluster, so they are skipped (mirroring how auth is handled).
 *
 * **Call this once, above the route switch — not per route.** The result lives
 * exactly as long as something observes it, and "once per open" is what that
 * lifetime is meant to express: an observer above the `<Switch>` (and above
 * `<Suspense>`) spans navigation within the cluster, while `gcTime: 0` evicts
 * the result once the user leaves the cluster, so returning re-prepares rather
 * than trusting a success that may since have gone stale — a proxy that died,
 * say. Observing it per route instead would tie preparation to the shortest-
 * lived component in the tree and re-run every hook whenever a route unmounts
 * with a gap before the next mounts (a suspended route, for instance).
 *
 * @param destinationClusters - Internal router override before committing navigation.
 */
export function useClusterPreOpen(destinationClusters?: string[]): ClusterPreOpenState {
  const dispatch = useDispatch();
  const client = useQueryClient();
  const activeCluster = useCluster();
  const activeClusters = useSelectedClusters();
  const cluster = destinationClusters ? destinationClusters[0] ?? null : activeCluster;
  const clusters = useClustersConf();
  const currentClusterConf = (cluster && clusters ? clusters[cluster] : null) ?? null;

  const preOpenHooksRevision = useTypedSelector(
    state => state.clusterProvider.preOpenHooksRevision
  );
  const config = useTypedSelector(state => state.config);
  const pluginsLoaded = useTypedSelector(state => state.plugins.loaded);
  const pluginLoadError = useTypedSelector(state => state.plugins.loadError);
  // Watch Layout's request without replacing its query options or issuing a
  // second request. Layout still owns configuration polling and theme updates.
  const configState = useSyncExternalStore(
    useCallback(
      notify =>
        client.getQueryCache().subscribe(event => {
          if (event.query.queryKey[0] === 'cluster-fetch') notify();
        }),
      [client]
    ),
    useCallback(() => client.getQueryState(['cluster-fetch']), [client])
  );
  // Reactive, not a render-time snapshot: going from a multi-cluster view to one
  // of its clusters can leave `cluster` unchanged (both resolve to the first
  // one), so a snapshot would keep reporting "multi" and skip preparation.
  const isSingleCluster = (destinationClusters ?? activeClusters).length <= 1;
  const readiness = clusterConfigReadiness(clusters, config);
  const configLoaded = readiness.ready;
  const configError =
    clusters === null && configState?.status === 'error'
      ? configState.error
      : readiness.error
      ? new Error(readiness.error)
      : null;
  const hasHooks = hasClusterPreOpenHooks();
  const pluginsReady = pluginsLoaded && !pluginLoadError;
  const enabled = !!cluster && isSingleCluster && (hasHooks || !configLoaded || !pluginsReady);

  const query = useQuery({
    ...clusterPreOpenOptions(
      cluster,
      currentClusterConf,
      isSingleCluster,
      preOpenHooksRevision,
      dispatch,
      !!cluster && Object.hasOwn(config.statelessClusters ?? {}, cluster)
    ),
    // Keep cluster routes gated while configuration loads, but do not execute
    // or cache a provider decision until the real cluster config is available.
    enabled: !!cluster && isSingleCluster && hasHooks && configLoaded && pluginsReady,
  });

  // The latest progress message a hook reported for this cluster (drives the
  // connecting popup's text). Undefined when the cluster isn't preparing.
  const message = useTypedSelector(state => {
    const preparation = cluster ? state.clusterProvider.preparing?.[cluster] : undefined;
    return preparation?.message;
  });

  return {
    enabled,
    isSuccess: configLoaded && pluginsReady && (!hasHooks || query.isSuccess),
    isError: !!configError || !!pluginLoadError || query.isError,
    error: configError ?? (pluginLoadError ? new Error(pluginLoadError) : query.error),
    message,
    retry: () => {
      if (pluginLoadError) {
        dispatch(reloadPage());
      } else if (clusters === null) {
        void client.refetchQueries({ queryKey: ['cluster-fetch'] });
      } else if (!readiness.ready) {
        void fetchStatelessClusterKubeConfigs(dispatch);
      } else if (pluginsLoaded && hasHooks) {
        void query.refetch();
      }
    },
  };
}
