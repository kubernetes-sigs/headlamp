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
import type { GatewayListener, GatewayListenerStatus } from './gateway';
import { KubeObject, type KubeObjectInterface } from './KubeObject';

/**
 * ParentGatewayReference identifies the Gateway that a ListenerSet attaches its
 * listeners to.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/geps/gep-1713/} Gateway API ListenerSet proposal (GEP-1713)
 */
export interface ListenerSetParentRef {
  group?: string;
  kind?: string;
  name: string;
  namespace?: string;
}

/**
 * ListenerSetSpec defines the desired state of a ListenerSet: a parent Gateway
 * reference plus the additional listeners to merge onto that Gateway.
 */
export interface ListenerSetSpec {
  parentRef: ListenerSetParentRef;
  listeners?: GatewayListener[];
  /** Allow custom vendor extensions until the API stabilises. */
  [key: string]: any;
}

/**
 * ListenerSetStatus mirrors the status reported by the implementation, including
 * per-listener status and the overall conditions.
 */
export interface ListenerSetStatus {
  conditions?: KubeCondition[];
  listeners?: GatewayListenerStatus[];
  [otherProps: string]: any;
}

/**
 * KubeListenerSet is the concrete Kubernetes resource interface.
 */
export interface KubeListenerSet extends KubeObjectInterface {
  spec: ListenerSetSpec;
  status?: ListenerSetStatus;
}

/**
 * ListenerSet – Gateway API resource (GEP-1713) that allows a set of Listeners to
 * be defined separately from the Gateway and attached to it via a parentRef. This
 * lets listeners be owned and managed independently of the Gateway itself.
 *
 * @see {@link https://gateway-api.sigs.k8s.io/geps/gep-1713/} Gateway API ListenerSet proposal (GEP-1713)
 */
class ListenerSet extends KubeObject<KubeListenerSet> {
  static kind = 'ListenerSet';
  static apiName = 'listenersets';
  static apiVersion = ['gateway.networking.k8s.io/v1', 'gateway.networking.k8s.io/v1alpha1'];
  static isNamespaced = true;

  get spec(): ListenerSetSpec {
    return this.jsonData.spec;
  }

  get status(): ListenerSetStatus | undefined {
    return this.jsonData.status;
  }

  get parentRef(): ListenerSetParentRef | undefined {
    return this.jsonData.spec?.parentRef;
  }

  getListeners(): GatewayListener[] {
    return this.jsonData.spec?.listeners ?? [];
  }

  getListenerStatusByName(name: string): GatewayListenerStatus | null {
    return this.jsonData.status?.listeners?.find(t => t.name === name) ?? null;
  }

  static get pluralName() {
    return 'xlistenersets';
  }
}

export default ListenerSet;
