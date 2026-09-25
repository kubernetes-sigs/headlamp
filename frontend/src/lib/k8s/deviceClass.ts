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

/**
 * A CEL expression the scheduler evaluates against each device. Only `cel` exists
 * today; the object wrapper leaves room for other selector kinds.
 */
export interface DeviceSelector {
  cel?: {
    expression: string;
  };
}

/** Driver specific parameters that the driver, not Kubernetes, interprets. */
export interface OpaqueDeviceConfiguration {
  driver: string;
  parameters: Record<string, unknown>;
}

export interface DeviceClassConfiguration {
  opaque?: OpaqueDeviceConfiguration;
}

export interface DeviceClassSpec {
  /** Every selector must match for a device to belong to the class. None matches all devices. */
  selectors?: DeviceSelector[];
  /** Configuration applied to every allocation of the class. */
  config?: DeviceClassConfiguration[];
  /**
   * Lets a pod's ordinary extended resource request, e.g. `example.com/gpu` in
   * `resources.limits`, be satisfied by devices of this class. Beta in 1.36.
   */
  extendedResourceName?: string;
}

export interface KubeDeviceClass extends KubeObjectInterface {
  spec: DeviceClassSpec;
}

class DeviceClass extends KubeObject<KubeDeviceClass> {
  static kind = 'DeviceClass';
  static apiName = 'deviceclasses';
  static apiVersion = 'resource.k8s.io/v1';
  static isNamespaced = false;

  /**
   * Whether the cluster serves the stable dynamic resource allocation API, which
   * needs Kubernetes 1.34 or later.
   * @param cluster - The cluster to check.
   * @returns true when the DeviceClass resource is served.
   */
  static isEnabled(cluster: string): Promise<boolean> {
    return isResourceServed(cluster, DeviceClass.apiVersion, DeviceClass.apiName);
  }

  get spec() {
    return this.jsonData.spec;
  }

  /** The CEL selectors as written. Shown as text because CEL cannot run in the browser. */
  get selectorExpressions(): string[] {
    return (this.spec?.selectors ?? []).flatMap(selector =>
      selector.cel ? [selector.cel.expression] : []
    );
  }

  /** A class without selectors matches every device of every driver. */
  get matchesAllDevices(): boolean {
    return this.selectorExpressions.length === 0;
  }

  /** The driver configurations every allocation of this class inherits. */
  get driverConfigs(): OpaqueDeviceConfiguration[] {
    return (this.spec?.config ?? []).flatMap(config => (config.opaque ? [config.opaque] : []));
  }

  /** The extended resource this class can satisfy, when it is mapped to one. */
  get extendedResourceName(): string | undefined {
    return this.spec?.extendedResourceName;
  }
}

export default DeviceClass;
