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

import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface KubePersistentVolumeClaim extends KubeObjectInterface {
  spec?: {
    accessModes?: string[];
    resources?: {
      limits?: object;
      requests: {
        storage?: string;
        [other: string]: any;
      };
    };
    storageClassName?: string;
    volumeMode?: string;
    volumeName?: string;
    [other: string]: any;
  };
  status?: {
    capacity?: {
      storage?: string;
    };
    phase?: string;
    accessModes?: string[];
    [other: string]: any;
  };
}

class PersistentVolumeClaim extends KubeObject<KubePersistentVolumeClaim> {
  static kind = 'PersistentVolumeClaim';
  static apiName = 'persistentvolumeclaims';
  static apiVersion = 'v1';
  static isNamespaced = true;

  static getBaseObject(): KubePersistentVolumeClaim {
    const baseObject = super.getBaseObject() as KubePersistentVolumeClaim;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {
      storageClassName: '',
      volumeName: '',
    };
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }
}

export default PersistentVolumeClaim;
