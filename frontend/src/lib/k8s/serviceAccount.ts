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

export interface KubeServiceAccount extends KubeObjectInterface {
  secrets: {
    apiVersion: string;
    fieldPath: string;
    kind: string;
    name: string;
    namespace: string;
    uid: string;
  }[];
}

class ServiceAccount extends KubeObject<KubeServiceAccount> {
  static kind = 'ServiceAccount';
  static apiName = 'serviceaccounts';
  static apiVersion = 'v1';
  static isNamespaced = true;

  static getBaseObject(): KubeServiceAccount {
    const baseObject = super.getBaseObject() as KubeServiceAccount;
    baseObject.metadata = {
      ...baseObject.metadata,
      namespace: '',
    };
    baseObject.secrets = [];
    return baseObject;
  }

  get secrets(): KubeServiceAccount['secrets'] {
    return this.jsonData.secrets;
  }
}

export default ServiceAccount;
