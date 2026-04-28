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
 * GRPCRouteMatch defines the predicate used to match requests to a given action.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRouteMatch} Gateway API reference for GRPCRouteMatch
 */
export interface GRPCRouteMatch {
  method?: {
    type?: string;
    service?: string;
    method?: string;
  };
  headers?: {
    type?: string;
    name: string;
    value: string;
  }[];
}

/**
 * GRPCRouteRule defines semantics for matching a gRPC request based on conditions (matches),
 * processing it (filters), and forwarding the request to an API object (backendRefs).
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRouteRule} Gateway API reference for GRPCRouteRule
 */
export interface GRPCRouteRule {
  name?: string;
  matches?: GRPCRouteMatch[];
  filters?: {
    type: string;
    [key: string]: any;
  }[];
  backendRefs?: {
    group?: string;
    kind?: string;
    name: string;
    namespace?: string;
    port?: number;
    weight?: number;
  }[];
}

/**
 * GRPCRoute is a Gateway API type for specifying routing behavior of gRPC requests from a Gateway listener to an API object, i.e. Service.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRoute} Gateway API reference for GRPCRoute
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/grpcroute/} Gateway API definition for GRPCRoute
 */
export interface KubeGRPCRoute extends KubeObjectInterface {
  spec: {
    hostnames?: string[];
    parentRefs?: GatewayParentReference[];
    rules?: GRPCRouteRule[];
    [key: string]: any;
  };
}

class GRPCRoute extends KubeObject<KubeGRPCRoute> {
  static kind = 'GRPCRoute';
  static apiName = 'grpcroutes';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1beta1'];
  static isNamespaced = true;

  get spec(): KubeGRPCRoute['spec'] {
    return this.jsonData.spec;
  }

  get hostnames(): string[] {
    return this.jsonData.spec.hostnames || [];
  }

  get rules(): GRPCRouteRule[] {
    return this.jsonData.spec.rules || [];
  }

  get parentRefs(): GatewayParentReference[] {
    return this.jsonData.spec.parentRefs || [];
  }

  static get pluralName() {
    return 'grpcroutes';
  }
}

export default GRPCRoute;
