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
import type { DeviceRequest, ResourceClaimSpec } from './resourceClaim';
import { getRequestedDeviceClasses } from './resourceClaim';

/** Labels and annotations stamped onto every claim made from the template. */
export interface ResourceClaimTemplateMetadata {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface ResourceClaimTemplateSpec {
  metadata?: ResourceClaimTemplateMetadata;
  spec: ResourceClaimSpec;
}

export interface KubeResourceClaimTemplate extends KubeObjectInterface {
  spec: ResourceClaimTemplateSpec;
}

class ResourceClaimTemplate extends KubeObject<KubeResourceClaimTemplate> {
  static kind = 'ResourceClaimTemplate';
  static apiName = 'resourceclaimtemplates';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = true;

  /**
   * Whether the cluster serves the stable dynamic resource allocation API, which
   * needs Kubernetes 1.34 or later.
   * @param cluster - The cluster to check.
   * @returns true when the ResourceClaimTemplate resource is served.
   */
  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(
      cluster,
      ResourceClaimTemplate.apiVersion,
      ResourceClaimTemplate.apiName
    );
  }

  get spec() {
    return this.jsonData.spec;
  }

  /** The requests every claim made from this template asks for. */
  get requests(): DeviceRequest[] {
    return this.spec?.spec?.devices?.requests ?? [];
  }

  /** Every device class a claim from this template can be satisfied by. */
  get requestedClasses(): string[] {
    return [...new Set(this.requests.flatMap(getRequestedDeviceClasses))];
  }
}

export default ResourceClaimTemplate;
