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
import { useDispatch } from 'react-redux';
import { useCluster, useClustersConf, useSelectedClusters } from '../../lib/k8s';
import { hasClusterPreOpenHooks, runClusterPreOpenHooks } from '../../plugin/clusterPreOpen';
import {
  clearClusterPreparing,
  setClusterPreparing,
  startClusterPreparing,
} from '../../redux/clusterProviderSlice';
import { useTypedSelector } from '../../redux/hooks';

let nextClusterPreOpenRunId = 0;

/** Preparation state for the cluster currently in the URL. */
export interface ClusterPreOpenState {
  /** Whether preparation applies at all (single cluster, hooks registered). */
  enabled: boolean;
  /** All hooks resolved; the cluster's views may render. */
  isSuccess: boolean;
  /** A hook rejected; `error` carries the reason. */
  isError: boolean;
  error: unknown;
  /** The latest progress message a hook reported, if any. */
  message?: string;
  /** Runs the hooks again (the retry affordance on the error UI). */
  retry: () => void;
}

/**
 * Runs the registered cluster pre-open hooks for the cluster in the URL, once
 * per open.
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
 */
export function useClusterPreOpen(): ClusterPreOpenState {
  const dispatch = useDispatch();
  const cluster = useCluster();
  const clusters = useClustersConf();
  const currentClusterConf = (cluster && clusters ? clusters[cluster] : null) ?? null;

  const preOpenHooksRevision = useTypedSelector(
    state => state.clusterProvider.preOpenHooksRevision
  );
  const statelessConfigLoaded = useTypedSelector(
    state => !state.config.isDynamicClusterEnabled || state.config.statelessClusters !== null
  );
  // Reactive, not a render-time snapshot: going from a multi-cluster view to one
  // of its clusters can leave `cluster` unchanged (both resolve to the first
  // one), so a snapshot would keep reporting "multi" and skip preparation.
  const isSingleCluster = useSelectedClusters().length <= 1;
  const enabled = !!cluster && isSingleCluster && hasClusterPreOpenHooks();
  const configLoaded = clusters !== null && statelessConfigLoaded;

  const query = useQuery({
    queryKey: ['clusterPreOpen', cluster, isSingleCluster, preOpenHooksRevision],
    // `signal` is consumed deliberately: React Query only aborts an in-flight
    // fetch if the query function takes it. Without that, a query whose fetch is
    // still pending is not evicted by gcTime, so leaving and reopening the
    // cluster reattaches to the abandoned run instead of preparing again.
    queryFn: async ({ signal }) => {
      // Capture the cluster this run prepares so cleanup stays keyed to it even
      // if the user navigates to a different cluster while hooks are running.
      const preparingCluster = cluster!;
      const runId = `${preparingCluster}:${++nextClusterPreOpenRunId}`;
      // Mark the cluster as preparing so the connecting popup shows and the
      // "Lost connection" health banner is suppressed while hooks run.
      dispatch(startClusterPreparing({ cluster: preparingCluster, runId }));
      const reportProgress = (message: string) =>
        dispatch(setClusterPreparing({ cluster: preparingCluster, runId, message }));
      try {
        await runClusterPreOpenHooks(
          {
            cluster: preparingCluster,
            clusterConf: currentClusterConf,
            reportProgress,
            signal,
          },
          () => {
            if (signal.aborted) {
              // The user left the cluster; stop before the next hook rather than
              // finishing work whose result is already discarded.
              throw new DOMException('Cluster preparation aborted', 'AbortError');
            }
            dispatch(setClusterPreparing({ cluster: preparingCluster, runId, message: '' }));
          }
        );
        return true;
      } finally {
        // Clear deterministically for the cluster we prepared (on success or
        // error) so a mid-run navigation can't leave a stale "preparing" entry.
        dispatch(clearClusterPreparing({ cluster: preparingCluster, runId }));
      }
    },
    // Keep cluster routes gated while configuration loads, but do not execute
    // or cache a provider decision until the real cluster config is available.
    enabled: enabled && configLoaded,
    retry: 0,
    // Prepare a cluster once per open: staleTime keeps hooks from re-running
    // while the cluster stays open, and gcTime: 0 evicts the result once the
    // last observer goes — which, with this hook called above the route switch,
    // means when the user leaves the cluster.
    staleTime: Infinity,
    gcTime: 0,
  });

  // The latest progress message a hook reported for this cluster (drives the
  // connecting popup's text). Undefined when the cluster isn't preparing.
  const message = useTypedSelector(state => {
    const preparation = cluster ? state.clusterProvider.preparing?.[cluster] : undefined;
    return preparation?.message;
  });

  return {
    enabled,
    isSuccess: query.isSuccess,
    isError: query.isError,
    error: query.error,
    message,
    retry: query.refetch,
  };
}
