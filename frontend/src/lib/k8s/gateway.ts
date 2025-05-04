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

import { KubeCondition } from './cluster';
import { KubeObject, KubeObjectInterface } from './KubeObject';

/**
 * ParentReference identifies an API object (usually a Gateway) that can be considered a parent of this resource (usually a route).
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ParentReference} Gateway API reference for ParentReference
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
 * Listener embodies the concept of a logical endpoint where a Gateway accepts network connections.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Listener} Gateway API reference for Listener
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
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ListenerStatus} Gateway API reference for ListenerStatus
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
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GatewayStatusAddress} Gateway API reference for GatewayStatusAddress
 */
export interface GatewayStatusAddress {
  type?: string;
  value: string;
}

/**
 * Gateway represents an instance of a service-traffic handling infrastructure by binding Listeners to a set of IP addresses.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Gateway} Gateway API reference for Gateway
 *
 * @see {@link https://gateway-api.sigs.k8s.io/api-types/gateway/} Gateway API definition for Gateway
 */
export interface KubeGateway extends KubeObjectInterface {
  spec: {
    gatewayClassName?: string;
    listeners: GatewayListener[];
    [key: string]: any;
  };
  status: {
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
    return this.jsonData.spec.listeners;
  }

  getAddresses(): GatewayStatusAddress[] {
    return this.jsonData.status.addresses || [];
  }

  getListernerStatusByName(name: string): GatewayListenerStatus | null {
    return this.jsonData.status.listeners?.find(t => t.name === name) || null;
  }

  static get pluralName() {
    return 'gateways';
  }
}

export default Gateway;
