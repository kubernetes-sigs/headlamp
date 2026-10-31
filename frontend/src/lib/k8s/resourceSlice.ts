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

import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';
import { isResourceServed } from './resourceAvailability';
import type { NodeSelectorTerm } from './resourceClaim';

export interface DeviceAttribute {
  int?: number;
  bool?: boolean;
  string?: string;
  version?: string;
}

export interface DeviceCapacity {
  value: string;
}

export interface ResourceSliceDevice {
  name: string;
  attributes?: Record<string, DeviceAttribute>;
  capacity?: Record<string, DeviceCapacity>;
}

export interface ResourcePool {
  name: string;
  generation: number;
  resourceSliceCount: number;
}

export interface ResourceSliceSpec {
  driver: string;
  pool: ResourcePool;
  nodeName?: string;
  nodeSelector?: { nodeSelectorTerms: NodeSelectorTerm[] };
  allNodes?: boolean;
  perDeviceNodeSelection?: boolean;
  devices?: ResourceSliceDevice[];
}

export interface KubeResourceSlice extends KubeObjectInterface {
  spec: ResourceSliceSpec;
}

export type ResourceSliceNodeAccess = 'node' | 'nodeSelector' | 'allNodes' | 'perDevice';

class ResourceSlice extends KubeObject<KubeResourceSlice> {
  static kind = 'ResourceSlice';
  static apiName = 'resourceslices';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = false;

  /**
   * Whether the cluster serves the stable dynamic resource allocation API, which
   * needs Kubernetes 1.34 or later.
   * @param cluster - The cluster to check.
   * @returns true when the ResourceSlice resource is served.
   */
  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, ResourceSlice.apiVersion, ResourceSlice.apiName);
  }

  get spec() {
    return this.jsonData.spec;
  }

  get driver(): string {
    return this.spec?.driver ?? '';
  }

  get poolName(): string {
    return this.spec?.pool?.name ?? '';
  }

  get devices(): ResourceSliceDevice[] {
    return this.spec?.devices ?? [];
  }

  get nodeAccess(): ResourceSliceNodeAccess | undefined {
    if (this.spec?.nodeName) {
      return 'node';
    }
    if (this.spec?.nodeSelector) {
      return 'nodeSelector';
    }
    if (this.spec?.allNodes) {
      return 'allNodes';
    }
    if (this.spec?.perDeviceNodeSelection) {
      return 'perDevice';
    }
    return undefined;
  }
}

export default ResourceSlice;
