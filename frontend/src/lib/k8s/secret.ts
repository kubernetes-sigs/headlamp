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

export interface KubeSecret extends KubeObjectInterface {
  data: Record<string, string>;
  type: string;
}

class Secret extends KubeObject<KubeSecret> {
  static kind = 'Secret';
  static apiName = 'secrets';
  static apiVersion = 'v1';
  static isNamespaced = true;

  static getBaseObject(): KubeSecret {
    const baseObject = super.getBaseObject() as KubeSecret;
    baseObject.data = {};
    return baseObject;
  }

  get data() {
    return this.jsonData.data;
  }

  get type() {
    return this.jsonData.type;
  }
}

export default Secret;
