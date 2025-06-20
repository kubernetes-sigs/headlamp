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

/**
 * ReferenceGrantFrom defines the source resource (e.g., HTTPRoute) that is allowed to reference a target resource.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant} Gateway API reference for ReferenceGrant
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/referencegrant/#structure} Gateway API definition for ReferenceGrantFrom
 */
export interface ReferenceGrantFrom {
  group: string;
  kind: string;
  namespace: string;
}

/**
 * ReferenceGrantTo defines the target resource (e.g., Service or Secret) that can be referenced.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant} Gateway API reference for ReferenceGrant
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/referencegrant/#structure} Gateway API definition for ReferenceGrantTo
 */
export interface ReferenceGrantTo {
  group: string;
  kind: string;
  name?: string;
}

/**
 * ReferenceGrant is a Gateway API type that enables cross-namespace references for resources like HTTPRoute or Gateway.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant} Gateway API reference for ReferenceGrant
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/referencegrant/} Gateway API definition for ReferenceGrant
 */
export interface KubeReferenceGrant extends KubeObjectInterface {
  spec: {
    from: ReferenceGrantFrom[];
    to: ReferenceGrantTo[];
    [key: string]: any;
  };
}

class ReferenceGrant extends KubeObject<KubeReferenceGrant> {
  static kind = 'ReferenceGrant';
  static apiName = 'referencegrants';
  static apiVersion = ['gateway.networking.k8s.io/v1beta1'];
  static isNamespaced = true;

  get spec(): KubeReferenceGrant['spec'] {
    return this.jsonData.spec;
  }

  get from(): ReferenceGrantFrom[] {
    return this.jsonData.spec.from || [];
  }

  get to(): ReferenceGrantTo[] {
    return this.jsonData.spec.to || [];
  }

  static get pluralName() {
    return 'referencegrants';
  }
}

export default ReferenceGrant;
