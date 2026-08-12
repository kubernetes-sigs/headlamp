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
import { KubeObject, type KubeObjectInterface } from './KubeObject';

/**
 * ParentReference identifies an API object (usually a Gateway) that can be considered a parent of this resource (usually a route).
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#parentreference} Gateway API reference for ParentReference
 */
export interface GatewayParentReference {
  group?: string;
  kind?: string;
  namespace?: string;
  sectionName?: string;
  name: string;
  port?: number;
}

/**
 * BackendObjectReference identifies a backend API object to which a route can forward traffic.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#backendobjectreference} Gateway API reference for BackendObjectReference
 */
export interface GatewayBackendReference {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
  port?: number;
  weight?: number;
}

/**
 * L4RouteRule defines a TCPRoute or UDPRoute rule and its backend references.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#tcprouterule} Gateway API reference for TCPRouteRule
 */
export interface GatewayL4RouteRule {
  name?: string;
  backendRefs?: GatewayBackendReference[];
}

/**
 * RouteParentStatus describes the status of a route as seen by one of its parents.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#routeparentstatus} Gateway API reference for RouteParentStatus
 */
export interface GatewayRouteParentStatus {
  parentRef: GatewayParentReference;
  controllerName: string;
  conditions?: KubeCondition[];
}

/** The common spec shared by Gateway API L4 route resources. */
export interface GatewayL4RouteSpec {
  parentRefs?: GatewayParentReference[];
  rules?: GatewayL4RouteRule[];
  [key: string]: any;
}

/** The common status shared by Gateway API L4 route resources. */
export interface GatewayL4RouteStatus {
  parents?: GatewayRouteParentStatus[];
  [key: string]: any;
}

/** The common Kubernetes object shape shared by Gateway API L4 route resources. */
export interface KubeGatewayL4Route extends KubeObjectInterface {
  spec: GatewayL4RouteSpec;
  status?: GatewayL4RouteStatus;
}

/**
 * Listener embodies the concept of a logical endpoint where a Gateway accepts network connections.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listener} Gateway API reference for Listener
 */
export interface GatewayListener {
  hostname: string;
  name: string;
  protocol: string;
  port: number;
  [key: string]: any;
}

/**
 * ListenerStatus is the status associated with a Listener.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#listenerstatus} Gateway API reference for ListenerStatus
 */
export interface GatewayListenerStatus {
  name: string;
  attachedRoutes: number;
  supportedKinds: any[];
  conditions: KubeCondition[];
}

/**
 * GatewayStatusAddress describes a network address that is bound to a Gateway.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#gatewaystatusaddress} Gateway API reference for GatewayStatusAddress
 */
export interface GatewayStatusAddress {
  type?: string;
  value: string;
}

/**
 * Gateway represents an instance of a service-traffic handling infrastructure by binding Listeners to a set of IP addresses.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-spec/main/spec/#gateway} Gateway API reference for Gateway
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/api-types/gateway/} Gateway API definition for Gateway
 */
export interface KubeGateway extends KubeObjectInterface {
  spec?: {
    gatewayClassName?: string;
    listeners?: GatewayListener[];
    [key: string]: any;
  };
  status?: {
    addresses?: GatewayStatusAddress[];
    listeners?: GatewayListenerStatus[];
    conditions?: KubeCondition[];
    [otherProps: string]: any;
  };
}

class Gateway extends KubeObject<KubeGateway> {
  static kind = 'Gateway';
  static apiName = 'gateways';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1beta1'];
  static isNamespaced = true;

  get spec(): KubeGateway['spec'] {
    return this.jsonData.spec;
  }

  get status() {
    return this.jsonData.status;
  }

  getListeners(): GatewayListener[] {
    return this.jsonData.spec?.listeners ?? [];
  }

  getAddresses(): GatewayStatusAddress[] {
    return this.jsonData.status?.addresses ?? [];
  }

  getListenerStatusByName(name: string): GatewayListenerStatus | null {
    return this.jsonData.status?.listeners?.find(t => t.name === name) ?? null;
  }

  static get pluralName() {
    return 'gateways';
  }
}

export default Gateway;
