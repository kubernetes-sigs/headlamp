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

export interface KubeStorageClass extends KubeObjectInterface {
  provisioner: string;
  reclaimPolicy: string;
  volumeBindingMode: string;
  allowVolumeExpansion?: boolean;
}

class StorageClass extends KubeObject<KubeStorageClass> {
  static kind = 'StorageClass';
  static apiName = 'storageclasses';
  static apiVersion = 'storage.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeStorageClass {
    const baseObject = super.getBaseObject() as KubeStorageClass;
    baseObject.provisioner = '';
    baseObject.reclaimPolicy = '';
    baseObject.volumeBindingMode = '';
    baseObject.allowVolumeExpansion = false;
    return baseObject;
  }

  get provisioner() {
    return this.jsonData.provisioner;
  }

  get reclaimPolicy() {
    return this.jsonData.reclaimPolicy;
  }

  get volumeBindingMode() {
    return this.jsonData.volumeBindingMode;
  }

  get allowVolumeExpansion() {
    return this.jsonData.allowVolumeExpansion;
  }

  static get listRoute() {
    return 'storageClasses';
  }

  static get pluralName() {
    return 'storageclasses';
  }
}

export default StorageClass;
