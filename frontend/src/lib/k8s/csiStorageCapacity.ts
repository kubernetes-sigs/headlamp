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

import type { LabelSelector } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface KubeCSIStorageCapacity extends KubeObjectInterface {
  storageClassName: string;
  capacity?: string;
  maximumVolumeSize?: string;
  nodeTopology?: LabelSelector;
}

class CSIStorageCapacity extends KubeObject<KubeCSIStorageCapacity> {
  static kind = 'CSIStorageCapacity';
  static apiName = 'csistoragecapacities';
  static apiVersion = 'storage.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeCSIStorageCapacity {
    const baseObject = super.getBaseObject() as KubeCSIStorageCapacity;
    baseObject.storageClassName = '';
    return baseObject;
  }

  get storageClassName() {
    return this.jsonData.storageClassName;
  }

  get capacity() {
    return this.jsonData.capacity;
  }

  get maximumVolumeSize() {
    return this.jsonData.maximumVolumeSize;
  }

  get nodeTopology() {
    return this.jsonData.nodeTopology;
  }

  static get listRoute() {
    return 'csiStorageCapacities';
  }

  static get pluralName() {
    return 'csistoragecapacities';
  }
}

export default CSIStorageCapacity;
