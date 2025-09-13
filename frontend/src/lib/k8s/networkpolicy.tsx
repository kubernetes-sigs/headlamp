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

import type { LabelSelector } from './cluster';
import type { KubeObjectInterface } from './KubeObject';
import { KubeObject } from './KubeObject';

export interface NetworkPolicyPort {
  port?: string | number;
  protocol?: string;
  endPort?: number;
}

export interface IPBlock {
  cidr: string;
  except: string[];
}

export interface NetworkPolicyPeer {
  ipBlock?: IPBlock;
  namespaceSelector?: LabelSelector;
  podSelector?: LabelSelector;
}

export interface NetworkPolicyEgressRule {
  ports: NetworkPolicyPort[];
  to: NetworkPolicyPeer[];
}

export interface NetworkPolicyIngressRule {
  ports: NetworkPolicyPort[];
  from: NetworkPolicyPeer[];
}

export interface KubeNetworkPolicy extends KubeObjectInterface {
  egress: NetworkPolicyEgressRule[];
  ingress: NetworkPolicyIngressRule[];
  podSelector: LabelSelector;
  policyTypes: string[];
}

class NetworkPolicy extends KubeObject<KubeNetworkPolicy> {
  static kind = 'NetworkPolicy';
  static apiName = 'networkpolicies';
  static apiVersion = 'networking.k8s.io/v1';
  static isNamespaced = true;

  static getBaseObject(): KubeNetworkPolicy {
    const baseObject = super.getBaseObject() as KubeNetworkPolicy;
    baseObject.egress = [
      {
        ports: [
          {
            port: 80,
            protocol: 'TCP',
          },
        ],
        to: [
          {
            podSelector: {
              matchLabels: { app: 'headlamp' },
            },
          },
        ],
      },
    ];
    baseObject.ingress = [
      {
        ports: [
          {
            port: 80,
            protocol: 'TCP',
          },
        ],
        from: [
          {
            podSelector: {
              matchLabels: { app: 'headlamp' },
            },
          },
        ],
      },
    ];
    baseObject.podSelector = {
      matchLabels: { app: 'headlamp' },
    };
    baseObject.policyTypes = ['Ingress', 'Egress'];
    return baseObject;
  }

  static get pluralName() {
    return 'networkpolicies';
  }
}

export default NetworkPolicy;
