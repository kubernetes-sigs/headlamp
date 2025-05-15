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

export interface KubeIngressClass extends KubeObjectInterface {
  spec: {
    controller: string;
    [key: string]: any;
  };
}

class IngressClass extends KubeObject<KubeIngressClass> {
  static kind = 'IngressClass';
  static apiName = 'ingressclasses';
  static apiVersion = 'networking.k8s.io/v1';
  static isNamespaced = false;

  static getBaseObject(): KubeIngressClass {
    const baseObject = super.getBaseObject() as KubeIngressClass;
    baseObject.spec = { controller: '' };
    return baseObject;
  }

  get spec(): KubeIngressClass['spec'] {
    return this.jsonData.spec;
  }

  get isDefault(): boolean {
    const annotations = this.jsonData.metadata?.annotations;
    if (annotations !== undefined) {
      return annotations['ingressclass.kubernetes.io/is-default-class'] === 'true';
    }
    return false;
  }

  static get listRoute() {
    return 'ingressclasses';
  }

  static get pluralName() {
    return 'ingressclasses';
  }
}

export default IngressClass;
