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

export interface KubeCSIDriver extends KubeObjectInterface {
  spec: {
    attachRequired?: boolean;
    podInfoOnMount?: boolean;
    storageCapacity?: boolean;
    fsGroupPolicy?: string;
    volumeLifecycleModes?: string[];
    requiresRepublish?: boolean;
    seLinuxMount?: boolean;
    [key: string]: any;
  };
}

class CSIDriver extends KubeObject<KubeCSIDriver> {
  static kind = 'CSIDriver';
  static apiName = 'csidrivers';
  static apiVersion = 'storage.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeCSIDriver {
    const baseObject = super.getBaseObject() as KubeCSIDriver;
    baseObject.spec = {
      attachRequired: false,
      podInfoOnMount: false,
      storageCapacity: false,
      volumeLifecycleModes: [],
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  static get listRoute() {
    return 'csiDrivers';
  }

  static get pluralName() {
    return 'csidrivers';
  }
}

export default CSIDriver;
