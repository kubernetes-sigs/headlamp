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

import { post, remove, request } from './api/v1/clusterRequests';
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

export class PoolStatusRequestTimeoutError extends Error {
  constructor(driver: string) {
    super(`Timed out waiting for the pool status of driver ${driver}`);
    this.name = 'PoolStatusRequestTimeoutError';
  }
}

/**
 * Asks a cluster for the status of a driver's pools, and removes the request afterwards.
 *
 * The answer is computed once per request. The wait has a limit because, as of Kubernetes
 * 1.37, a driver with an incomplete pool leaves its request without a status.
 * @param spec - The driver, and optionally the pool, to ask about.
 * @param cluster - The cluster to ask.
 * @returns The answered request, which may have failed.
 * @throws PoolStatusRequestTimeoutError when the cluster does not answer in time.
 */
export async function requestPoolStatus(
  spec: ResourcePoolStatusRequestSpec,
  cluster: string
): Promise<ResourcePoolStatusRequest> {
  const { apiVersion, apiName, kind } = ResourcePoolStatusRequest;
  const url = `/apis/${apiVersion}/${apiName}`;
  const created: KubeResourcePoolStatusRequest = await post(
    url,
    { apiVersion, kind, metadata: { generateName: 'headlamp-pool-status-' }, spec },
    true,
    { cluster }
  );
  const requestUrl = `${url}/${created.metadata.name}`;

  try {
    const deadline = Date.now() + POOL_STATUS_TIMEOUT_MS;
    let current = new ResourcePoolStatusRequest(created, cluster);

    while (current.isPending) {
      if (Date.now() >= deadline) {
        throw new PoolStatusRequestTimeoutError(spec.driver);
      }
      await new Promise(resolve => setTimeout(resolve, POOL_STATUS_POLL_INTERVAL_MS));
      current = new ResourcePoolStatusRequest(await request(requestUrl, { cluster }), cluster);
    }

    return current;
  } finally {
    // A user allowed to create but not delete leaves it to the controller's cleanup.
    await remove(requestUrl, { cluster }).catch(() => {});
  }
}
