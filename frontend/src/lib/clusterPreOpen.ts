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

import type { Dispatch, UnknownAction } from '@reduxjs/toolkit';
import { QueryClient, QueryObserver, queryOptions } from '@tanstack/react-query';
import { hasClusterPreOpenHooks, runClusterPreOpenHooks } from '../plugin/clusterPreOpen';
import {
  clearClusterPreparing,
  setClusterPreparing,
  startClusterPreparing,
} from '../redux/clusterProviderSlice';
import type { ConfigState } from '../redux/configSlice';
import { findKubeconfigByClusterName } from '../stateless/findKubeconfigByClusterName';
import type { Cluster } from './k8s/cluster';
import { completeClusterConnectionPreparation } from './preparedClusterConnection';

let nextRunId = 0;

/** Requests can select stored overrides independently, so unresolved loads fail closed. */
export function clusterConfigReadiness(
  clusters: ConfigState['allClusters'],
  config: Pick<
    ConfigState,
    'isDynamicClusterEnabled' | 'statelessClusters' | 'statelessConfigError'
  >
) {
  const storedConfigPending = config.isDynamicClusterEnabled && config.statelessClusters === null;
  const error = config.isDynamicClusterEnabled ? config.statelessConfigError ?? null : null;
  return { ready: clusters !== null && !storedConfigPending && !error, error };
}

/** Internal shared preparation identity for navigation and background settings reads. */
export function clusterPreOpenOptions(
  cluster: string | null,
  clusterConf: Cluster | null,
  isSingleCluster: boolean,
  revision: number,
  dispatch: Dispatch<UnknownAction>,
  isStoredCluster = false
) {
  return queryOptions({
    queryKey: [
      'clusterPreOpen',
      cluster,
      isSingleCluster,
      revision,
      { source: isStoredCluster ? 'stored' : 'backend', config: clusterConf },
    ],
    // Consuming signal lets the last owner abort pending hooks and evict the run.
    queryFn: async ({ signal }) => {
      const preparingCluster = cluster!;
      const runId = `${preparingCluster}:${++nextRunId}`;
      dispatch(startClusterPreparing({ cluster: preparingCluster, runId }));
      const reportProgress = (message: string) => {
        if (typeof message !== 'string') {
          console.warn('Cluster preparation progress must be a string');
        }
        dispatch(
          setClusterPreparing({
            cluster: preparingCluster,
            runId,
            message: typeof message === 'string' ? message : '',
          })
        );
      };
      try {
        await runClusterPreOpenHooks(
          { cluster: preparingCluster, clusterConf, reportProgress, signal },
          () => {
            if (signal.aborted) {
              throw new DOMException('Cluster preparation aborted', 'AbortError');
            }
            dispatch(setClusterPreparing({ cluster: preparingCluster, runId, message: '' }));
          }
        );
        signal.throwIfAborted();
        const kubeconfig = isStoredCluster
          ? await findKubeconfigByClusterName(preparingCluster)
          : null;
        signal.throwIfAborted();
        completeClusterConnectionPreparation(preparingCluster, {
          stored: isStoredCluster,
          kubeconfig,
        });
        return true;
      } finally {
        dispatch(clearClusterPreparing({ cluster: preparingCluster, runId }));
      }
    },
    retry: 0,
    retryOnMount: false,
    networkMode: 'always',
    staleTime: Infinity,
    gcTime: 0,
  });
}

/**
 * Holds preparation only for the lifetime of a settings read. Sharing the router's
 * query deduplicates open-cluster work; releasing it allows once-per-open eviction.
 */
export async function withPreparedCluster<T>(
  client: QueryClient,
  options: ReturnType<typeof clusterPreOpenOptions>,
  signal: AbortSignal,
  read: () => Promise<T>
): Promise<T> {
  signal.throwIfAborted();
  if (!hasClusterPreOpenHooks()) {
    return read();
  }
  const observer = new QueryObserver(client, options);
  let unsubscribe = () => {};
  let onAbort = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      const settle = (result: ReturnType<typeof observer.getCurrentResult>) => {
        if (result.isSuccess) resolve();
        else if (result.isError) reject(result.error);
      };
      onAbort = () => {
        unsubscribe();
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      unsubscribe = observer.subscribe(settle);
      settle(observer.getCurrentResult());
    });
    signal.throwIfAborted();
    return await read();
  } finally {
    signal.removeEventListener('abort', onAbort);
    unsubscribe();
  }
}
