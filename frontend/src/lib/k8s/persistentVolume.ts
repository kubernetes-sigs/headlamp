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

export interface KubePersistentVolume extends KubeObjectInterface {
  spec: {
    capacity: {
      storage: string;
    };
    [other: string]: any;
  };
  status: {
    message: string;
    phase: string;
    reason: string;
  };
}

class PersistentVolume extends KubeObject<KubePersistentVolume> {
  static kind = 'PersistentVolume';
  static apiName = 'persistentvolumes';
  static apiVersion = 'v1';
  static isNamespaced = false;

  static getBaseObject(): KubePersistentVolume {
    const baseObject = super.getBaseObject() as KubePersistentVolume;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.spec = {
      capacity: {
        storage: '',
      },
    };
    baseObject.status = {
      message: '',
      phase: '',
      reason: '',
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

export default PersistentVolume;
