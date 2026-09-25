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

import type {
  GatewayL4RouteRule,
  GatewayL4RouteStatus,
  GatewayParentReference,
  GatewayRouteParentStatus,
} from './gateway';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

/**
 * TLSRoute is a Gateway API type for routing TLS traffic (passthrough) from a Gateway
 * listener to backend API objects. Unlike TCP/UDP routes, TLSRoute supports hostname-based
 * matching via spec.hostnames.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-types/tlsroute/} Gateway API definition for TLSRoute
 */
export interface KubeTLSRoute extends KubeObjectInterface {
  spec: {
    hostnames?: string[];
    parentRefs?: GatewayParentReference[];
    rules?: GatewayL4RouteRule[];
    [key: string]: any;
  };
  status?: GatewayL4RouteStatus;
}

class TLSRoute extends KubeObject<KubeTLSRoute> {
  static kind = 'TLSRoute';
  static apiName = 'tlsroutes';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1alpha2'];
  static isNamespaced = true;

  get spec(): KubeTLSRoute['spec'] {
    return this.jsonData.spec;
  }

  get rules(): GatewayL4RouteRule[] {
    return this.jsonData.spec.rules || [];
  }

  get parentRefs(): GatewayParentReference[] {
    return this.jsonData.spec.parentRefs || [];
  }

  get parents(): GatewayRouteParentStatus[] {
    return this.jsonData.status?.parents || [];
  }

  get hostnames(): string[] {
    return this.jsonData.spec.hostnames || [];
  }

  static get pluralName() {
    return 'tlsroutes';
  }
}

export default TLSRoute;
