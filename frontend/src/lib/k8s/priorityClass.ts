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

export interface KubePriorityClass extends KubeObjectInterface {
  value: number;
  preemptionPolicy: string;
  globalDefault?: boolean | null;
  description: string;
}

class PriorityClass extends KubeObject<KubePriorityClass> {
  static kind = 'PriorityClass';
  static apiName = 'priorityclasses';
  static apiVersion = 'scheduling.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubePriorityClass {
    const baseObject = super.getBaseObject() as KubePriorityClass;
    baseObject.value = 0;
    baseObject.preemptionPolicy = '';
    baseObject.globalDefault = false;
    baseObject.description = '';
    return baseObject;
  }

  get value(): number {
    return this.jsonData!.value;
  }

  get globalDefault(): boolean | null {
    return this.jsonData.globalDefault!;
  }

  get description(): string {
    return this.jsonData.description;
  }

  get preemptionPolicy(): string {
    return this.jsonData.preemptionPolicy;
  }
}

export default PriorityClass;
