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

import { StringDict } from './cluster';
import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface KubeConfigMap extends KubeObjectInterface {
  data: StringDict;
}

class ConfigMap extends KubeObject<KubeConfigMap> {
  static kind = 'ConfigMap';
  static apiName = 'configmaps';
  static apiVersion = 'v1';
  static isNamespaced = true;

  get data() {
    return this.jsonData.data;
  }

  static getBaseObject(): KubeConfigMap {
    const baseObject = super.getBaseObject() as KubeConfigMap;
    baseObject.data = {};
    return baseObject;
  }
}

export default ConfigMap;
