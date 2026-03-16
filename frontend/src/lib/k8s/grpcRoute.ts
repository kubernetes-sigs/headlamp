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
 * GRPCRoute is a Gateway API type for specifying routing behavior of gRPC requests from a Gateway listener to an API object, i.e. Service.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GRPCRoute} Gateway API reference for GRPCRoute
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/grpcroute/} Gateway API definition for GRPCRoute
 */
export interface KubeGRPCRoute extends KubeObjectInterface {
  spec: {
    parentRefs: GatewayParentReference[];
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
  get parentRefs(): GatewayParentReference[] {
    return this.jsonData.spec.parentRefs;
  }

  static get pluralName() {
    return 'grpcroutes';
  }
}

export default GRPCRoute;
