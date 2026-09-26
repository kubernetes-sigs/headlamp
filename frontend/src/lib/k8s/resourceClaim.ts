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

/** How many devices a request asks for. */
export type DeviceAllocationMode = 'ExactCount' | 'All';

/** One alternative of a prioritized list, tried in the order the list gives. */
export interface DeviceSubRequest {
  name: string;
  deviceClassName: string;
  allocationMode?: DeviceAllocationMode;
  count?: number;
}

/** A request for devices of one class. */
export interface ExactDeviceRequest {
  deviceClassName: string;
  allocationMode?: DeviceAllocationMode;
  count?: number;
}

/**
 * One named request within a claim. Exactly one of `exactly` and `firstAvailable`
 * is set: `firstAvailable` lists alternatives the scheduler tries in order.
 */
export interface DeviceRequest {
  name: string;
  exactly?: ExactDeviceRequest;
  firstAvailable?: DeviceSubRequest[];
}

export interface ResourceClaimSpec {
  devices?: {
    requests?: DeviceRequest[];
  };
}

/** One device the scheduler granted, and the request it was granted for. */
export interface DeviceRequestAllocationResult {
  /**
   * The request this device satisfies. For an alternative of a prioritized list
   * this is `<request>/<subrequest>`.
   */
  request: string;
  driver: string;
  pool: string;
  device: string;
}

/** One requirement on a node's labels or fields. */
export interface NodeSelectorRequirement {
  key: string;
  operator: string;
  values?: string[];
}

/** One way a node can qualify. Requirements within a term all have to hold. */
export interface NodeSelectorTerm {
  matchExpressions?: NodeSelectorRequirement[];
  matchFields?: NodeSelectorRequirement[];
}

export interface AllocationResult {
  devices?: {
    results?: DeviceRequestAllocationResult[];
  };
  /** Where the allocated devices are reachable. Node local devices name one node. */
  nodeSelector?: {
    nodeSelectorTerms?: NodeSelectorTerm[];
  };
}

/** Who may use an allocated claim. A back reference, not an owner reference. */
export interface ResourceClaimConsumerReference {
  apiGroup?: string;
  resource: string;
  name: string;
  uid: string;
}

export interface ResourceClaimStatus {
  /** Stays unset until the scheduler has allocated the claim. */
  allocation?: AllocationResult;
  reservedFor?: ResourceClaimConsumerReference[];
}

export interface KubeResourceClaim extends KubeObjectInterface {
  spec: ResourceClaimSpec;
  /** Served as an empty object while the claim is still pending. */
  status?: ResourceClaimStatus;
}

/**
 * The state of a claim, composed because the API has no phase field: a claim is
 * pending until the scheduler writes an allocation, allocated once it has one, and
 * in use while consumers are reserved for it.
 */
export type ResourceClaimState = 'Pending' | 'Allocated' | 'InUse';

/**
 * Which state a claim's status describes.
 * @param status - The status of a ResourceClaim, absent while it is pending.
 * @returns 'Pending', 'Allocated' when nothing uses it yet, or 'InUse'.
 */
export function getResourceClaimState(status: ResourceClaimStatus | undefined): ResourceClaimState {
  if (!status?.allocation) {
    return 'Pending';
  }
  return status.reservedFor?.length ? 'InUse' : 'Allocated';
}

/**
 * The device classes a request can be satisfied by. A request asks for one class
 * directly, or lists alternatives that each name their own.
 * @param request - A request of a claim.
 * @returns The class names in the order the scheduler would try them.
 */
export function getRequestedDeviceClasses(request: DeviceRequest): string[] {
  if (request.exactly) {
    return [request.exactly.deviceClassName];
  }
  return (request.firstAvailable ?? []).map(subrequest => subrequest.deviceClassName);
}

class ResourceClaim extends KubeObject<KubeResourceClaim> {
  static kind = 'ResourceClaim';
  static apiName = 'resourceclaims';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = true;

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  /** The requests this claim makes, in the order they were written. */
  get requests(): DeviceRequest[] {
    return this.spec?.devices?.requests ?? [];
  }

  /** Every device class this claim can be satisfied by, without duplicates. */
  get requestedClasses(): string[] {
    return [...new Set(this.requests.flatMap(getRequestedDeviceClasses))];
  }

  /** Whether the scheduler has answered this claim. */
  get isAllocated(): boolean {
    return !!this.status?.allocation;
  }

  /** Pending, allocated but unused, or in use. Composed; the API has no phase. */
  get state(): ResourceClaimState {
    return getResourceClaimState(this.status);
  }

  /** The devices the scheduler granted, empty while the claim is pending. */
  get allocatedDevices(): DeviceRequestAllocationResult[] {
    return this.status?.allocation?.devices?.results ?? [];
  }

  /** The workloads allowed to use this claim. A back reference, not an owner. */
  get consumers(): ResourceClaimConsumerReference[] {
    return this.status?.reservedFor ?? [];
  }

  /**
   * The single node the allocation is restricted to, when the selector names one.
   * The scheduler writes this for node local devices.
   */
  get allocatedNodeName(): string | undefined {
    const terms = this.status?.allocation?.nodeSelector?.nodeSelectorTerms;
    if (terms?.length !== 1) {
      return undefined;
    }

    const fields = terms[0].matchFields;
    const nameField = fields?.find(field => field.key === 'metadata.name');
    return nameField?.values?.length === 1 ? nameField.values[0] : undefined;
  }
}

export default ResourceClaim;
