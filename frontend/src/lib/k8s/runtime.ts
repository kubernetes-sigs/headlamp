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

export interface KubeRuntimeClass extends KubeObjectInterface {
  handler: string;
  overhead?: any;
  scheduling?: any;
}

export class RuntimeClass extends KubeObject<KubeRuntimeClass> {
  static kind = 'RuntimeClass';
  static apiName = 'runtimeclasses';
  static apiVersion = 'node.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeRuntimeClass {
    const baseObject = super.getBaseObject() as KubeRuntimeClass;
    baseObject.handler = '';
    return baseObject;
  }

  get spec() {
    return this.jsonData.spec;
  }
}
