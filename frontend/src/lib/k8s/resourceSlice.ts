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

/** The value of one device attribute. Exactly one of the fields is set. */
export interface DeviceAttribute {
  /** A number. */
  int?: number;
  /** A true or false value. */
  bool?: boolean;
  /** A string of up to 64 characters. */
  string?: string;
  /** A semantic version, for example a driver or firmware version. */
  version?: string;
}

/** How much of one resource a device has. */
export interface DeviceCapacity {
  /** A Kubernetes quantity, such as `80Gi` or `100`. */
  value: string;
}

/**
 * A taint a driver puts on a device. Claims that do not tolerate it cannot be
 * allocated the device, and with `NoExecute` the Pods using it are evicted.
 */
export interface DeviceTaint {
  /** The taint key, a label name. */
  key: string;
  /** The taint value, a label value. */
  value?: string;
  /** None, NoSchedule or NoExecute. Unknown effects behave like None. */
  effect: string;
  /** When the taint was added. */
  timeAdded?: string;
}

/** One device that a driver publishes in a slice. */
export interface ResourceSliceDevice {
  /** The device name, unique within the pool. */
  name: string;
  /** Facts about the device that selectors can match, keyed by a qualified name. */
  attributes?: Record<string, DeviceAttribute>;
  /** The amounts of resources the device has, keyed by a qualified name. */
  capacity?: Record<string, DeviceCapacity>;
  /**
   * The one node that can use the device. The node fields of a device are set only
   * when the slice uses `perDeviceNodeSelection`, and then exactly one of them is set.
   */
  nodeName?: string;
  /** The nodes that can use the device. */
  nodeSelector?: { nodeSelectorTerms: NodeSelectorTerm[] };
  /** Set when every node in the cluster can use the device. */
  allNodes?: boolean;
  /** The taints the driver put on the device. */
  taints?: DeviceTaint[];
  /**
   * The shared counters the device draws from when it is allocated, for devices that are
   * partitions of the same hardware. The counter sets are published by a slice in the same pool.
   */
  consumesCounters?: DeviceCounterConsumption[];
}

/** An amount of a counter, such as memory or compute units. */
export interface Counter {
  /** The amount, as a Kubernetes quantity. */
  value: string;
}

/**
 * A set of counters that the devices of a pool share, for example the memory of one GPU
 * that several partitions of it use.
 */
export interface CounterSet {
  /** The name of the set, unique within the pool. */
  name: string;
  /** The total amount of each counter, keyed by counter name. */
  counters: Record<string, Counter>;
}

/** How much of the counters in one shared counter set a device uses. */
export interface DeviceCounterConsumption {
  /** The name of a counter set in the `spec.sharedCounters` of a slice in the same pool. */
  counterSet: string;
  /** The amount of each counter the device uses, keyed by counter name. */
  counters: Record<string, Counter>;
}

/** The pool a slice belongs to. A pool can span several slices. */
export interface ResourcePool {
  /** The pool name. For devices local to a node, this is often the node name. */
  name: string;
  /**
   * Changes whenever the driver changes the pool. Only the slices with the highest
   * generation describe the pool.
   */
  generation: number;
  /** How many slices make up the pool at this generation. */
  resourceSliceCount: number;
}

/**
 * What a driver publishes about its devices. Exactly one of `nodeName`,
 * `nodeSelector`, `allNodes` and `perDeviceNodeSelection` says where they can be used.
 */
export interface ResourceSliceSpec {
  /** The name of the DRA driver that publishes the slice, for example `gpu.example.com`. */
  driver: string;
  /** The pool the slice belongs to. */
  pool: ResourcePool;
  /** The one node that can use the devices, for devices local to a node. */
  nodeName?: string;
  /** The nodes that can use the devices, for devices shared by several nodes. */
  nodeSelector?: { nodeSelectorTerms: NodeSelectorTerm[] };
  /** Set when every node in the cluster can use the devices. */
  allNodes?: boolean;
  /** Set when each device says which nodes can use it. */
  perDeviceNodeSelection?: boolean;
  /** The devices in the slice. */
  devices?: ResourceSliceDevice[];
  /**
   * Counter sets that the devices of the pool draw from, for partitionable devices. A slice
   * sets either this or `devices`, not both.
   */
  sharedCounters?: CounterSet[];
}

/** A ResourceSlice as served by the `resource.k8s.io/v1` API. */
export interface KubeResourceSlice extends KubeObjectInterface {
  spec: ResourceSliceSpec;
}

/** Which field of the spec says where the devices of a slice can be used. */
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

  /** The name of the driver that publishes the slice. */
  get driver(): string {
    return this.spec?.driver ?? '';
  }

  /** The name of the pool the slice belongs to. */
  get poolName(): string {
    return this.spec?.pool?.name ?? '';
  }

  /** The devices in the slice, empty when it publishes none. */
  get devices(): ResourceSliceDevice[] {
    return this.spec?.devices ?? [];
  }

  /** The counter sets the slice publishes for the devices of its pool, empty when there are none. */
  get sharedCounters(): CounterSet[] {
    return this.spec?.sharedCounters ?? [];
  }

  /** Which spec field says where the devices can be used, if any is set. */
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
