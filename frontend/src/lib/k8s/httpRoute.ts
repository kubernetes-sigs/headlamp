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

import type { GatewayParentReference } from './gateway';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

/**
 * HTTPRouteRule defines semantics for matching an HTTP request based on conditions (matches), processing it (filters), and forwarding the request to an API object (backendRefs).
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRouteRule} Gateway API reference for HTTPRouteRule
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/httproute/#rules} Gateway API definition for HTTPRouteRule
 */
export interface HTTPRouteRule {
  name?: string;
  backendRefs?: any[];
  matches?: any[];
  [key: string]: any;
}

/**
 * HTTPRoute is a Gateway API type for specifying routing behavior of HTTP requests from a Gateway listener to an API object, i.e. Service.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRoute} Gateway API reference for HTTPRoute
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/httproute/} Gateway API definition for HTTPRoute
 */
export interface KubeHTTPRoute extends KubeObjectInterface {
  spec: {
    hostnames?: string[];
    parentRefs?: GatewayParentReference[];
    rules?: HTTPRouteRule[];
    [key: string]: any;
  };
}

class HTTPRoute extends KubeObject<KubeHTTPRoute> {
  static kind = 'HTTPRoute';
  static apiName = 'httproutes';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1beta1'];
  static isNamespaced = true;

  get spec(): KubeHTTPRoute['spec'] {
    return this.jsonData.spec;
  }

  get hostnames(): string[] {
    return this.jsonData.spec.hostnames || [];
  }

  get rules(): HTTPRouteRule[] {
    return this.jsonData.spec.rules || [];
  }

  get parentRefs(): GatewayParentReference[] {
    return this.jsonData.spec.parentRefs || [];
  }

  static get pluralName() {
    return 'httproutes';
  }
}

export default HTTPRoute;
