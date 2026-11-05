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
}

export default ResourcePoolStatusRequest;
