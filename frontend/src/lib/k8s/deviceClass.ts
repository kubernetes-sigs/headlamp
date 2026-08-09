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

export interface KubeDeviceClass extends KubeObjectInterface {
  spec: {
    selectors?: Array<{
      cel?: {
        expression: string;
      };
    }>;
    config?: Array<{
      opaque?: {
        driver: string;
        parameters: any;
      };
      [key: string]: any;
    }>;
    [key: string]: any;
  };
}

class DeviceClass extends KubeObject<KubeDeviceClass> {
  static kind = 'DeviceClass';
  static apiName = 'deviceclasses';
  static apiVersion = [
    'resource.k8s.io/v1',
    'resource.k8s.io/v1beta2',
    'resource.k8s.io/v1beta1',
    'resource.k8s.io/v1alpha3',
  ];
  static isNamespaced = false;

  static getBaseObject(): KubeDeviceClass {
    return super.getBaseObject() as KubeDeviceClass;
  }

  static get listRoute() {
    return 'deviceclasses';
  }

  static get pluralName() {
    return 'deviceclasses';
  }

  get spec() {
    return this.jsonData.spec;
  }
}

export default DeviceClass;
