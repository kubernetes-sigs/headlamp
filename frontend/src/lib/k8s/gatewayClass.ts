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

import type { KubeCondition } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

/**
 * GatewayClass is cluster-scoped resource defined by the infrastructure provider. This resource represents a class of Gateways that can be instantiated.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GatewayClass} Gateway API reference for GatewayClass
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/gatewayclass/} Gateway API definition for GatewayClass
 */
export interface KubeGatewayClass extends KubeObjectInterface {
  spec: {
    controllerName: string;
    [key: string]: any;
  };
  status: {
    conditions?: KubeCondition[];
    [otherProps: string]: any;
  };
}

class GatewayClass extends KubeObject<KubeGatewayClass> {
  static kind = 'GatewayClass';
  static apiName = 'gatewayclasses';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1beta1'];
  static isNamespaced = false;

  get spec(): KubeGatewayClass['spec'] {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  get controllerName() {
    return this.spec!.controllerName;
  }

  static get listRoute() {
    return 'GatewayClasses';
  }

  static get pluralName() {
    return 'gatewayclasses';
  }
}

export default GatewayClass;
