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
  GatewayParentReference,
  GatewayRouteParentStatus,
  KubeGatewayL4Route,
} from './gateway';
import { KubeObject } from './KubeObject';

/**
 * TCPRoute is a Gateway API type for routing TCP traffic from a Gateway listener to backend API objects.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-types/tcproute/} Gateway API definition for TCPRoute
 */
class TCPRoute extends KubeObject<KubeGatewayL4Route> {
  static kind = 'TCPRoute';
  static apiName = 'tcproutes';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1alpha2'];
  static isNamespaced = true;

  get spec(): KubeGatewayL4Route['spec'] {
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

  static get pluralName() {
    return 'tcproutes';
  }
}

export default TCPRoute;
