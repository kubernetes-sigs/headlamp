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
import { useState } from 'react';
import { post, remove, request } from './api/v1/clusterRequests';
import type { ApiError } from './api/v2/ApiError';
import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { isResourceServed } from './resourceAvailability';

export interface ResourcePoolStatusRequestSpec {
  driver: string;
  poolName?: string;
  limit?: number;
}

export interface PoolStatus {
  driver: string;
  poolName: string;
  generation: number;
  nodeName?: string;
  resourceSliceCount?: number;
  totalDevices?: number;
  allocatedDevices?: number;
  availableDevices?: number;
  unavailableDevices?: number;
  validationError?: string;
}

/**
 * @param pool - A pool from the status of a request.
 * @returns true when the driver had not published the whole pool, so its counts are unset.
 */
export function isPoolIncomplete(pool: PoolStatus): boolean {
  return !!pool.validationError?.startsWith('PoolIncomplete:');
}

export type PoolStatusRequestCondition = Omit<KubeCondition, 'lastProbeTime' | 'lastUpdateTime'>;

export interface ResourcePoolStatusRequestStatus {
  poolCount?: number;
  pools?: PoolStatus[];
  conditions?: PoolStatusRequestCondition[];
}

export interface KubeResourcePoolStatusRequest extends KubeObjectInterface {
  spec: ResourcePoolStatusRequestSpec;
  status?: ResourcePoolStatusRequestStatus;
}

class ResourcePoolStatusRequest extends KubeObject<KubeResourcePoolStatusRequest> {
  static kind = 'ResourcePoolStatusRequest';
  static apiName = 'resourcepoolstatusrequests';
  static apiVersion = 'resource.k8s.io/v1alpha3';
  static isNamespaced = false;

  /**
   * Whether the cluster serves this alpha API, which needs Kubernetes 1.36 or later with
   * the DRAResourcePoolStatus feature gate and resource.k8s.io/v1alpha3 enabled.
   * @param cluster - The cluster to check.
   * @returns true when the ResourcePoolStatusRequest resource is served.
   */
  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(
      cluster,
      ResourcePoolStatusRequest.apiVersion,
      ResourcePoolStatusRequest.apiName
    );
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  private hasCondition(type: string): boolean {
    return !!this.status?.conditions?.some(
      condition => condition.type === type && condition.status === 'True'
    );
  }

  get isComplete(): boolean {
    return this.hasCondition('Complete');
  }

  get isFailed(): boolean {
    return this.hasCondition('Failed');
  }

  get isWaitingForPools(): boolean {
    return this.hasCondition('WaitingForPools');
  }

  get isPending(): boolean {
    return !this.isComplete && !this.isFailed;
  }

  get failureMessage(): string | undefined {
    return this.status?.conditions?.find(condition => condition.type === 'Failed')?.message;
  }

  get pools(): PoolStatus[] {
    return this.status?.pools ?? [];
  }

  get poolCount(): number {
    return this.status?.poolCount ?? 0;
  }

  get isTruncated(): boolean {
    return this.pools.length < this.poolCount;
  }
}

export default ResourcePoolStatusRequest;

const POOL_STATUS_TIMEOUT_MS = 30_000;
const POOL_STATUS_POLL_INTERVAL_MS = 1_000;
const REQUEST_TIMED_OUT_STATUS = 408;

export class PoolStatusRequestTimeoutError extends Error {
  constructor(driver: string) {
    super(`Timed out waiting for the pool status of driver ${driver}`);
    this.name = 'PoolStatusRequestTimeoutError';
  }
}

export interface PoolStatusRequestOptions {
  /** Called with the request while it is not answered yet. */
  onProgress?: (current: ResourcePoolStatusRequest) => void;
  /** Stops the wait when aborted. A request already created is still removed. */
  signal?: AbortSignal;
}

/**
 * Asks a cluster for the status of a driver's pools, and removes the request afterwards.
 *
 * The answer is computed once per request. The wait has a limit because, as of Kubernetes
 * 1.37, a driver with an incomplete pool leaves its request without a status.
 * @param spec - The driver, and optionally the pool, to ask about.
 * @param cluster - The cluster to ask.
 * @param options - How to follow or cancel the wait.
 * @returns The answered request, which may have failed.
 * @throws PoolStatusRequestTimeoutError when the cluster does not answer in time.
 * @throws The reason of the signal when it is aborted.
 */
export async function requestPoolStatus(
  spec: ResourcePoolStatusRequestSpec,
  cluster: string,
  { onProgress, signal }: PoolStatusRequestOptions = {}
): Promise<ResourcePoolStatusRequest> {
  signal?.throwIfAborted();

  const { apiVersion, apiName, kind } = ResourcePoolStatusRequest;
  const url = `/apis/${apiVersion}/${apiName}`;
  // Not cancelled with the signal, as the name in its answer is needed to remove the request.
  const created: KubeResourcePoolStatusRequest = await post(
    url,
    { apiVersion, kind, metadata: { generateName: 'headlamp-pool-status-' }, spec },
    true,
    { cluster }
  );
  const requestUrl = `${url}/${created.metadata.name}`;

  const aborted = new Promise<never>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  // Nothing may be waiting for it when the signal is aborted.
  aborted.catch(() => {});

  try {
    const deadline = Date.now() + POOL_STATUS_TIMEOUT_MS;
    let current = new ResourcePoolStatusRequest(created, cluster);

    while (current.isPending) {
      signal?.throwIfAborted();
      onProgress?.(current);
      await Promise.race([
        new Promise(resolve =>
          setTimeout(resolve, Math.min(POOL_STATUS_POLL_INTERVAL_MS, deadline - Date.now()))
        ),
        aborted,
      ]);

      const timeout = deadline - Date.now();
      if (timeout <= 0) {
        throw new PoolStatusRequestTimeoutError(spec.driver);
      }

      try {
        current = new ResourcePoolStatusRequest(
          await Promise.race([request(requestUrl, { cluster, timeout }), aborted]),
          cluster
        );
      } catch (err) {
        signal?.throwIfAborted();
        const timedOut =
          (err as ApiError).status === REQUEST_TIMED_OUT_STATUS ||
          (err as Error).name === 'AbortError';
        throw timedOut ? new PoolStatusRequestTimeoutError(spec.driver) : err;
      }
    }

    return current;
  } finally {
    // Not awaited, so a slow removal cannot extend the wait. A user allowed to create but not
    // delete leaves it to the controller's cleanup.
    remove(requestUrl, { cluster }).catch(() => {});
  }
}

/**
 * Asks a cluster for the status of a driver's pools, once for each driver and cluster given.
 *
 * Asking about another driver or cluster, or unmounting, cancels the current request.
 * @param cluster - The cluster to ask.
 * @param spec - What to ask about, or undefined to ask nothing.
 * @returns The answer, whether it is still awaited, and a function to ask again.
 */
export function usePoolStatusRequest(cluster: string, spec?: ResourcePoolStatusRequestSpec) {
  const [progress, setProgress] = useState<ResourcePoolStatusRequest>();

  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ['poolStatusRequest', cluster, spec],
    queryFn: ({ signal }) => {
      setProgress(undefined);
      return requestPoolStatus(spec!, cluster, { onProgress: setProgress, signal });
    },
    enabled: !!spec,
    // Every run creates an object in the cluster and its answer ages at once, so neither
    // keep an answer nor ask again unless told to.
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  // The progress of the last request is still set while the next one is being created.
  const isOwnProgress =
    progress?.cluster === cluster &&
    progress.spec.driver === spec?.driver &&
    progress.spec.poolName === spec?.poolName;

  return {
    answer: data,
    error,
    isPending: isFetching,
    isWaitingForPools: isFetching && isOwnProgress && progress.isWaitingForPools,
    refetch,
  };
}
